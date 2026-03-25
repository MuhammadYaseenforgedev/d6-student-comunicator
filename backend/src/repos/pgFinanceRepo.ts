import { pool } from "../config/db";
import type {
  FinanceDocument,
  FinanceRepo,
  FinanceStatusNotification,
  FinanceSummary,
  FinanceTransaction,
} from "../persistence/types";

type SummaryRow = {
  user_id: string;
  balance_cents: number;
  currency: string;
  account_status: string;
  status_note: string | null;
  updated_at: string;
};

type TxRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  description: string;
  occurred_at: string;
  created_at: string;
};

type DocumentRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  description: string | null;
  amount_cents: number | null;
  currency: string;
  issued_at: string;
  document_url: string | null;
  created_by: string | null;
  created_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  severity: string;
  created_by: string | null;
  created_at: string;
};

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function mapSummary(row: SummaryRow): FinanceSummary {
  return {
    userId: row.user_id,
    balanceCents: row.balance_cents,
    currency: row.currency,
    accountStatus: row.account_status,
    statusNote: row.status_note,
    updatedAt: row.updated_at,
  };
}

function mapTransaction(row: TxRow): FinanceTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    description: row.description,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

function mapDocument(row: DocumentRow): FinanceDocument {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    amountCents: row.amount_cents,
    currency: row.currency,
    issuedAt: row.issued_at,
    documentUrl: row.document_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow): FinanceStatusNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const pgFinanceRepo: FinanceRepo = {
  async ensureAccount(userId: string): Promise<void> {
    const q = `
      INSERT INTO finance_accounts (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `;
    await pool.query(q, [userId]);
  },

  async getSummary(userId: string): Promise<FinanceSummary> {
    await this.ensureAccount(userId);

    const q = `
      SELECT user_id, balance_cents, currency, account_status, status_note, updated_at
      FROM finance_accounts
      WHERE user_id = $1
      LIMIT 1
    `;
    const res = await pool.query<SummaryRow>(q, [userId]);
    return mapSummary(res.rows[0]);
  },

  async updateAccount(
    userId: string,
    input: {
      balanceCents?: number;
      currency?: string;
      accountStatus?: string;
      statusNote?: string | null;
    }
  ): Promise<FinanceSummary> {
    await this.ensureAccount(userId);

    const updates: string[] = [];
    const params: unknown[] = [];

    if (typeof input.balanceCents === "number") {
      params.push(input.balanceCents);
      updates.push(`balance_cents = $${params.length}`);
    }

    if (typeof input.currency === "string" && input.currency.trim()) {
      params.push(input.currency.trim().toUpperCase());
      updates.push(`currency = $${params.length}`);
    }

    if (typeof input.accountStatus === "string" && input.accountStatus.trim()) {
      params.push(input.accountStatus.trim().toUpperCase());
      updates.push(`account_status = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, "statusNote")) {
      const value = typeof input.statusNote === "string" ? input.statusNote.trim() : null;
      params.push(value || null);
      updates.push(`status_note = $${params.length}`);
    }

    if (updates.length === 0) {
      return this.getSummary(userId);
    }

    params.push(userId);
    const result = await pool.query<SummaryRow>(
      `
        UPDATE finance_accounts
        SET ${updates.join(", ")},
            updated_at = now()
        WHERE user_id = $${params.length}
        RETURNING user_id, balance_cents, currency, account_status, status_note, updated_at
      `,
      params
    );

    return mapSummary(result.rows[0]);
  },

  async listTransactions(userId: string, opts?: { limit?: number; before?: string }): Promise<FinanceTransaction[]> {
    const limit = parseLimit(opts?.limit, 50);

    const q = `
      SELECT id, user_id, amount_cents, currency, description, occurred_at, created_at
      FROM finance_transactions
      WHERE user_id = $1
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT $2
    `;
    const res = await pool.query<TxRow>(q, [userId, limit]);

    return res.rows.map(mapTransaction);
  },

  async createTransaction(
    userId: string,
    input: {
      amountCents: number;
      currency?: string;
      description: string;
      occurredAt?: string;
    }
  ): Promise<FinanceTransaction> {
    await this.ensureAccount(userId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const transaction = await client.query<TxRow>(
        `
          INSERT INTO finance_transactions (user_id, amount_cents, currency, description, occurred_at)
          VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
          RETURNING id, user_id, amount_cents, currency, description, occurred_at, created_at
        `,
        [
          userId,
          input.amountCents,
          (input.currency ?? "ZAR").trim().toUpperCase() || "ZAR",
          input.description,
          input.occurredAt ?? null,
        ]
      );

      await client.query(
        `
          UPDATE finance_accounts
          SET balance_cents = balance_cents + $2,
              currency = $3,
              updated_at = now()
          WHERE user_id = $1
        `,
        [userId, input.amountCents, (input.currency ?? "ZAR").trim().toUpperCase() || "ZAR"]
      );

      await client.query("COMMIT");
      return mapTransaction(transaction.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async listDocuments(userId: string, opts?: { limit?: number }): Promise<FinanceDocument[]> {
    const limit = parseLimit(opts?.limit, 50);
    const result = await pool.query<DocumentRow>(
      `
        SELECT
          id,
          user_id,
          type,
          title,
          description,
          amount_cents,
          currency,
          issued_at,
          document_url,
          created_by,
          created_at
        FROM finance_documents
        WHERE user_id = $1
        ORDER BY issued_at DESC, created_at DESC
        LIMIT $2
      `,
      [userId, limit]
    );
    return result.rows.map(mapDocument);
  },

  async createDocument(
    userId: string,
    input: {
      type: string;
      title: string;
      description?: string | null;
      amountCents?: number | null;
      currency?: string;
      issuedAt?: string;
      documentUrl?: string | null;
      createdBy?: string | null;
    }
  ): Promise<FinanceDocument> {
    await this.ensureAccount(userId);

    const result = await pool.query<DocumentRow>(
      `
        INSERT INTO finance_documents (
          user_id,
          type,
          title,
          description,
          amount_cents,
          currency,
          issued_at,
          document_url,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9)
        RETURNING
          id,
          user_id,
          type,
          title,
          description,
          amount_cents,
          currency,
          issued_at,
          document_url,
          created_by,
          created_at
      `,
      [
        userId,
        input.type.trim().toUpperCase(),
        input.title,
        input.description?.trim() || null,
        input.amountCents ?? null,
        (input.currency ?? "ZAR").trim().toUpperCase() || "ZAR",
        input.issuedAt ?? null,
        input.documentUrl?.trim() || null,
        input.createdBy ?? null,
      ]
    );
    return mapDocument(result.rows[0]);
  },

  async listNotifications(userId: string, opts?: { limit?: number }): Promise<FinanceStatusNotification[]> {
    const limit = parseLimit(opts?.limit, 50);
    const result = await pool.query<NotificationRow>(
      `
        SELECT
          id,
          user_id,
          title,
          body,
          severity,
          created_by,
          created_at
        FROM finance_notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [userId, limit]
    );
    return result.rows.map(mapNotification);
  },

  async createNotification(
    userId: string,
    input: {
      title: string;
      body: string;
      severity?: string;
      createdBy?: string | null;
    }
  ): Promise<FinanceStatusNotification> {
    await this.ensureAccount(userId);

    const result = await pool.query<NotificationRow>(
      `
        INSERT INTO finance_notifications (user_id, title, body, severity, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, title, body, severity, created_by, created_at
      `,
      [userId, input.title, input.body, (input.severity ?? "INFO").trim().toUpperCase(), input.createdBy ?? null]
    );
    return mapNotification(result.rows[0]);
  },
};
