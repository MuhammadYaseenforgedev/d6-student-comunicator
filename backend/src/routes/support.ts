import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import {
  syncSupportTicketToPulse,
  type PulseTicketSyncStatus,
} from "../integrations/pulse/pulseTicketService";
import { requireAccess } from "../middleware/rbac";

const SUPPORT_TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const SUPPORT_TICKET_TYPES = ["ACCOUNT_ACCESS", "NETWORK", "POWER", "SOFTWARE", "DEVICE", "OTHER"] as const;

type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
type SupportTicketType = (typeof SUPPORT_TICKET_TYPES)[number];

type SupportTicketRow = {
  id: string;
  requester_email: string;
  requester_name: string | null;
  device_number: string | null;
  issue_type: SupportTicketType;
  message: string;
  status: SupportTicketStatus;
  admin_note: string | null;
  assigned_to: string | null;
  assigned_email: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  external_system: string | null;
  external_reference: string | null;
  pulse_sync_status: PulseTicketSyncStatus;
  pulse_synced_at: string | null;
  pulse_sync_error: string | null;
};

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTicketType(value: unknown): SupportTicketType | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SUPPORT_TICKET_TYPES.includes(normalized as SupportTicketType)
    ? (normalized as SupportTicketType)
    : null;
}

function normalizeTicketStatus(value: unknown): SupportTicketStatus | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SUPPORT_TICKET_STATUSES.includes(normalized as SupportTicketStatus)
    ? (normalized as SupportTicketStatus)
    : null;
}

function toPublicTicket(row: SupportTicketRow) {
  return {
    id: row.id,
    requesterEmail: row.requester_email,
    requesterName: row.requester_name,
    deviceNumber: row.device_number,
    issueType: row.issue_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    externalSystem: row.external_system,
    externalReference: row.external_reference,
    pulseSyncStatus: row.pulse_sync_status,
    pulseSyncedAt: row.pulse_synced_at,
  };
}

function toAdminTicket(row: SupportTicketRow) {
  return {
    ...toPublicTicket(row),
    message: row.message,
    adminNote: row.admin_note,
    assignedTo: row.assigned_to,
    assignedEmail: row.assigned_email,
    pulseSyncError: row.pulse_sync_error,
  };
}

const SUPPORT_TICKET_COLUMNS = `
  id,
  requester_email,
  requester_name,
  device_number,
  issue_type,
  message,
  status,
  admin_note,
  assigned_to,
  created_at,
  updated_at,
  resolved_at,
  external_system,
  external_reference,
  pulse_sync_status,
  pulse_synced_at,
  pulse_sync_error
`;

async function updatePulseSyncState(
  ticketId: string,
  input: {
    status: PulseTicketSyncStatus;
    externalSystem: string | null;
    externalReference: string | null;
    syncedAt: string | null;
    error: string | null;
  }
) {
  const updated = await pool.query<SupportTicketRow>(
    `
      UPDATE support_tickets
      SET
        external_system = $2,
        external_reference = $3,
        pulse_sync_status = $4,
        pulse_synced_at = $5::timestamptz,
        pulse_sync_error = $6,
        updated_at = now()
      WHERE id = $1
      RETURNING
        ${SUPPORT_TICKET_COLUMNS},
        NULL::text AS assigned_email
    `,
    [
      ticketId,
      input.externalSystem,
      input.externalReference,
      input.status,
      input.syncedAt,
      input.error,
    ]
  );

  return updated.rows[0] ?? null;
}

export const supportRouter = Router();

supportRouter.post("/tickets", async (req: Request, res: Response) => {
  try {
    const requesterEmail = normalizeEmail(req.body?.email);
    const requesterName = String(req.body?.name ?? "").trim() || null;
    const deviceNumber = String(req.body?.deviceNumber ?? "").trim() || null;
    const issueType = normalizeTicketType(req.body?.issueType);
    const message = String(req.body?.message ?? "").trim();

    if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      return err(res, 400, "VALIDATION", "A valid email address is required");
    }
    if (!issueType) {
      return err(res, 400, "VALIDATION", "issueType is invalid");
    }
    if (!message || message.length < 10) {
      return err(res, 400, "VALIDATION", "message must be at least 10 characters");
    }

    const created = await pool.query<SupportTicketRow>(
      `
        INSERT INTO support_tickets (
          id,
          requester_email,
          requester_name,
          device_number,
          issue_type,
          message,
          external_system,
          pulse_sync_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pulse', 'PENDING')
      RETURNING
        ${SUPPORT_TICKET_COLUMNS},
        NULL::text AS assigned_email
    `,
      [crypto.randomUUID(), requesterEmail, requesterName, deviceNumber, issueType, message]
    );

    const createdTicket = created.rows[0];
    const pulseSync = await syncSupportTicketToPulse(
      {
        id: createdTicket.id,
        requesterEmail,
        requesterName,
        deviceNumber,
        issueType,
        message,
      },
      {
        enabled: env.PULSE_SYNC_ENABLED,
        formUrl: env.PULSE_TICKET_FORM_URL,
        timeoutMs: env.PULSE_SYNC_TIMEOUT_MS,
      }
    );

    const syncedTicket =
      (await updatePulseSyncState(createdTicket.id, pulseSync)) ?? createdTicket;

    if (pulseSync.status === "FAILED") {
      console.error("[support] pulse sync failed", {
        ticketId: createdTicket.id,
        error: pulseSync.error,
      });
    }

    const responseMessage =
      pulseSync.status === "SYNCED"
        ? "Support request submitted. A matching ticket was sent to Pulse."
        : pulseSync.status === "FAILED"
          ? "Support request submitted. The Pulse handoff needs a retry, but your Forge ticket was saved safely."
          : "Support request submitted. The team will contact you by email.";

    return res.status(201).json({
      ok: true,
      ticket: toPublicTicket(syncedTicket),
      message: responseMessage,
      pulseSyncStatus: pulseSync.status,
    });
  } catch (e) {
    console.error("[support] POST /support/tickets error", e);
    return err(res, 500, "INTERNAL", "Failed to submit support ticket");
  }
});

supportRouter.get("/tickets", async (req: Request, res: Response) => {
  try {
    const requesterEmail = normalizeEmail(req.query.email);
    if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      return err(res, 400, "VALIDATION", "email query param is required");
    }

    const rows = await pool.query<SupportTicketRow>(
      `
        SELECT
          ${SUPPORT_TICKET_COLUMNS},
          NULL::text AS assigned_email
        FROM support_tickets
        WHERE lower(requester_email) = lower($1)
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [requesterEmail]
    );

    return res.json({ value: rows.rows.map(toPublicTicket), count: rows.rows.length });
  } catch (e) {
    console.error("[support] GET /support/tickets error", e);
    return err(res, 500, "INTERNAL", "Failed to load support tickets");
  }
});

supportRouter.get(
  "/admin/tickets",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["SUPER"] }),
  async (req: Request, res: Response) => {
    try {
      const statusFilter = String(req.query.status ?? "ALL").trim().toUpperCase();
      const q = String(req.query.q ?? "").trim().toLowerCase();
      const params: unknown[] = [];
      const where: string[] = [];

      if (statusFilter !== "ALL") {
        const status = normalizeTicketStatus(statusFilter);
        if (!status) return err(res, 400, "VALIDATION", "status filter is invalid");
        params.push(status);
        where.push(`st.status = $${params.length}`);
      }

      if (q) {
        params.push(`%${q}%`);
        where.push(`(
          lower(st.requester_email) LIKE $${params.length}
          OR lower(COALESCE(st.requester_name, '')) LIKE $${params.length}
          OR lower(COALESCE(st.device_number, '')) LIKE $${params.length}
          OR lower(st.issue_type) LIKE $${params.length}
          OR lower(st.message) LIKE $${params.length}
        )`);
      }

      const rows = await pool.query<SupportTicketRow>(
        `
          SELECT
            st.id,
            st.requester_email,
            st.requester_name,
            st.device_number,
            st.issue_type,
            st.message,
            st.status,
            st.admin_note,
            st.assigned_to,
            au.email AS assigned_email,
            st.created_at,
            st.updated_at,
            st.resolved_at,
            st.external_system,
            st.external_reference,
            st.pulse_sync_status,
            st.pulse_synced_at,
            st.pulse_sync_error
          FROM support_tickets st
          LEFT JOIN users au ON au.id = st.assigned_to
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY
            CASE st.status
              WHEN 'OPEN' THEN 1
              WHEN 'IN_PROGRESS' THEN 2
              WHEN 'RESOLVED' THEN 3
              WHEN 'CLOSED' THEN 4
              ELSE 5
            END,
            st.created_at DESC
        `,
        params
      );

      return res.json({ value: rows.rows.map(toAdminTicket), count: rows.rows.length });
    } catch (e) {
      console.error("[support] GET /support/admin/tickets error", e);
      return err(res, 500, "INTERNAL", "Failed to load admin tickets");
    }
  }
);

supportRouter.patch(
  "/admin/tickets/:id",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["SUPER"] }),
  async (req: Request, res: Response) => {
    try {
      const ticketId = String(req.params.id ?? "").trim();
      if (!isUuid(ticketId)) return err(res, 400, "VALIDATION", "ticket id must be a UUID");

      const hasStatus = Object.prototype.hasOwnProperty.call(req.body ?? {}, "status");
      const hasAdminNote = Object.prototype.hasOwnProperty.call(req.body ?? {}, "adminNote");
      if (!hasStatus && !hasAdminNote) {
        return err(res, 400, "VALIDATION", "At least one editable field is required");
      }

      const updates: string[] = ["updated_at = now()", "assigned_to = COALESCE(assigned_to, $1::uuid)"];
      const params: unknown[] = [req.user?.id ?? null];

      if (hasStatus) {
        const status = normalizeTicketStatus(req.body?.status);
        if (!status) return err(res, 400, "VALIDATION", "status is invalid");
        params.push(status);
        updates.push(`status = $${params.length}`);
        if (status === "RESOLVED" || status === "CLOSED") {
          updates.push("resolved_at = now()");
        } else {
          updates.push("resolved_at = NULL");
        }
      }

      if (hasAdminNote) {
        if (req.body?.adminNote != null && typeof req.body?.adminNote !== "string") {
          return err(res, 400, "VALIDATION", "adminNote must be text or null");
        }
        params.push(String(req.body?.adminNote ?? "").trim() || null);
        updates.push(`admin_note = $${params.length}`);
      }

      params.push(ticketId);

      const updated = await pool.query<SupportTicketRow>(
        `
          UPDATE support_tickets st
          SET ${updates.join(", ")}
          WHERE st.id = $${params.length}
          RETURNING
            st.id,
            st.requester_email,
            st.requester_name,
            st.device_number,
            st.issue_type,
            st.message,
            st.status,
            st.admin_note,
            st.assigned_to,
            (
              SELECT u.email
              FROM users u
              WHERE u.id = st.assigned_to
              LIMIT 1
            ) AS assigned_email,
            st.created_at,
            st.updated_at,
            st.resolved_at,
            st.external_system,
            st.external_reference,
            st.pulse_sync_status,
            st.pulse_synced_at,
            st.pulse_sync_error
        `,
        params
      );

      if ((updated.rowCount ?? 0) === 0) {
        return err(res, 404, "NOT_FOUND", "Support ticket not found");
      }

      return res.json({ ok: true, ticket: toAdminTicket(updated.rows[0]) });
    } catch (e) {
      console.error("[support] PATCH /support/admin/tickets/:id error", e);
      return err(res, 500, "INTERNAL", "Failed to update support ticket");
    }
  }
);
