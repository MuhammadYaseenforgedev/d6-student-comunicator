import { pool } from "../config/db";
import { repos } from "../persistence";
import type { CreateNotificationInput, NotificationCategory } from "../persistence/types";
import { fanOutWhatsAppForNotifications } from "./whatsapp/notificationFanout";

type UserRow = {
  id: string;
  email: string;
  role: string;
  public_student_id: string | null;
  admin_scope?: string | null;
};

type ChannelRow = {
  id: string;
  name: string;
  type: string;
  is_private: boolean;
};

type ParentLinkRow = {
  parent_user_id: string;
  student_user_id: string;
  email: string;
  public_student_id: string | null;
};

function studentLabel(user: Pick<UserRow, "email" | "public_student_id">): string {
  const publicStudentId = String(user.public_student_id ?? "").trim();
  if (publicStudentId) return publicStudentId;
  return user.email;
}

function clipText(value: string, limit = 140): string {
  const text = value.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}...`;
}

function notificationHref(path: string): Record<string, unknown> {
  return { href: path };
}

function financeAmount(balanceCents: number, currency: string): string {
  const value = (balanceCents / 100).toFixed(2);
  return `${currency} ${value}`;
}

async function fanOutWhatsAppSafely(createdNotifications: Awaited<ReturnType<typeof repos.notifications.createMany>>) {
  await fanOutWhatsAppForNotifications(createdNotifications).catch((e) => {
    console.warn("[notifications] WhatsApp dry-run fan-out failed", e);
  });
}

async function loadUsersByIds(userIds: string[]): Promise<Map<string, UserRow>> {
  if (userIds.length === 0) return new Map();

  const result = await pool.query<UserRow>(
    `
      SELECT id, email, role, public_student_id
      FROM users
      WHERE id = ANY($1::uuid[])
    `,
    [userIds]
  );

  return new Map(result.rows.map((row) => [row.id, row]));
}

async function loadParentLinksByStudentIds(studentIds: string[]): Promise<Map<string, ParentLinkRow[]>> {
  if (studentIds.length === 0) return new Map();

  const result = await pool.query<ParentLinkRow>(
    `
      SELECT
        pl.parent_user_id,
        pl.student_user_id,
        u.email,
        u.public_student_id
      FROM parent_links pl
      JOIN users u ON u.id = pl.parent_user_id
      WHERE pl.student_user_id = ANY($1::uuid[])
    `,
    [studentIds]
  );

  const grouped = new Map<string, ParentLinkRow[]>();
  for (const row of result.rows) {
    const current = grouped.get(row.student_user_id) ?? [];
    current.push(row);
    grouped.set(row.student_user_id, current);
  }
  return grouped;
}

async function loadChannel(channelId: string): Promise<ChannelRow | null> {
  const result = await pool.query<ChannelRow>(
    `
      SELECT id, name, type, is_private
      FROM channels
      WHERE id = $1
      LIMIT 1
    `,
    [channelId]
  );

  return result.rows[0] ?? null;
}

async function loadChannelRecipients(channel: ChannelRow, actorId: string): Promise<UserRow[]> {
  if (channel.is_private) {
    const result = await pool.query<UserRow>(
      `
        SELECT u.id, u.email, u.role, u.public_student_id
        FROM channel_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = $1
          AND u.id <> $2
      `,
      [channel.id, actorId]
    );

    return result.rows;
  }

  const result = await pool.query<UserRow>(
    `
      SELECT id, email, role, public_student_id
      FROM users
      WHERE id <> $1
    `,
    [actorId]
  );

  return result.rows;
}

export async function createAnnouncementNotifications(input: {
  announcementId: string;
  channelId: string;
  actorId: string;
  title: string;
  moduleId?: string | null;
  moduleLabel?: string | null;
}): Promise<void> {
  const channel = await loadChannel(input.channelId);
  if (!channel) return;

  const recipients =
    String(channel.name ?? "").trim().toLowerCase() === "modules" && input.moduleId
      ? (
          await pool.query<UserRow>(
            `
              SELECT DISTINCT u.id, u.email, u.role, u.public_student_id, u.admin_scope
              FROM users u
              WHERE u.id <> $2
                AND (
                  (u.role = 'ADMIN' AND COALESCE(u.admin_scope, 'SUPER') IN ('ACADEMIC', 'SUPER'))
                  OR EXISTS (
                    SELECT 1
                    FROM lecturer_module_assignments lma
                    WHERE lma.module_id = $1
                      AND lma.lecturer_id = u.id
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM student_module_enrollments sme
                    JOIN faculty_modules fm ON fm.id = sme.module_id
                    JOIN student_courses sc
                      ON sc.student_user_id = sme.student_id
                     AND sc.course_id = fm.course_id
                     AND sc.status = 'ACTIVE'
                    WHERE sme.module_id = $1
                      AND sme.student_id = u.id
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM parent_links pl
                    JOIN student_module_enrollments sme ON sme.student_id = pl.student_user_id
                    JOIN faculty_modules fm ON fm.id = sme.module_id
                    JOIN student_courses sc
                      ON sc.student_user_id = pl.student_user_id
                     AND sc.course_id = fm.course_id
                     AND sc.status = 'ACTIVE'
                    WHERE pl.parent_user_id = u.id
                      AND sme.module_id = $1
                  )
                )
            `,
            [input.moduleId, input.actorId]
          )
        ).rows
      : await loadChannelRecipients(channel, input.actorId);
  if (recipients.length === 0) return;

  const category: NotificationCategory =
    String(channel.type ?? "").toUpperCase() === "EMERGENCY" ? "EMERGENCY" : "ANNOUNCEMENT";
  const type = category === "EMERGENCY" ? "EMERGENCY_ALERT" : "ANNOUNCEMENT_CREATED";
  const title =
    category === "EMERGENCY"
      ? `Emergency alert: ${input.title}`
      : `New announcement in ${input.moduleLabel ?? channel.name}`;

  const createdNotifications = await repos.notifications.createMany(
    recipients.map((recipient) => ({
      userId: recipient.id,
      category,
      type,
      title,
      body: input.title,
      meta: {
        ...notificationHref(
          input.moduleId
            ? `/app/modules?moduleId=${encodeURIComponent(input.moduleId)}`
            : `/app/c/${input.channelId}`
        ),
        channelId: input.channelId,
        channelName: channel.name,
        channelType: channel.type,
        announcementId: input.announcementId,
        ...(input.moduleId ? { moduleId: input.moduleId } : {}),
        ...(input.moduleLabel ? { moduleLabel: input.moduleLabel } : {}),
      },
      sourceKey: `announcement:${input.announcementId}`,
    }))
  );
  await fanOutWhatsAppSafely(createdNotifications);
}

export async function createThreadMessageNotifications(input: {
  threadId: string;
  messageId: string;
  senderId: string;
  body: string;
}): Promise<void> {
  const senderResult = await pool.query<{ email: string }>(
    `
      SELECT email
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [input.senderId]
  );
  const senderEmail = senderResult.rows[0]?.email ?? "Someone";

  const recipients = await pool.query<UserRow>(
    `
      SELECT u.id, u.email, u.role, u.public_student_id
      FROM thread_participants tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.thread_id = $1
        AND tp.user_id <> $2
    `,
    [input.threadId, input.senderId]
  );

  if (recipients.rowCount === 0) return;

  await repos.notifications.createMany(
    recipients.rows.map((recipient) => ({
      userId: recipient.id,
      category: "MESSAGE",
      type: "THREAD_MESSAGE_CREATED",
      title: `New message from ${senderEmail}`,
      body: clipText(input.body),
      meta: {
        ...notificationHref(`/app/messages/${input.threadId}`),
        threadId: input.threadId,
        messageId: input.messageId,
        senderEmail,
      },
      sourceKey: `thread-message:${input.messageId}`,
    }))
  );
}

export async function createAttendanceNotifications(input: {
  sessionId: string;
  marks: Array<{ studentId: string; status: string }>;
}): Promise<void> {
  const uniqueMarks = new Map<string, string>();
  for (const mark of input.marks) {
    const studentId = String(mark.studentId ?? "").trim();
    const status = String(mark.status ?? "").trim().toUpperCase();
    if (!studentId || !status) continue;
    uniqueMarks.set(studentId, status);
  }

  const studentIds = Array.from(uniqueMarks.keys());
  if (studentIds.length === 0) return;

  const sessionRes = await pool.query<{ attendance_date: string; code: string; name: string }>(
    `
      SELECT
        s.attendance_date,
        fm.code,
        fm.name
      FROM attendance_sessions s
      JOIN faculty_modules fm ON fm.id = s.module_id
      WHERE s.id = $1
      LIMIT 1
    `,
    [input.sessionId]
  );

  const session = sessionRes.rows[0];
  if (!session) return;

  const usersById = await loadUsersByIds(studentIds);
  const parentLinksByStudentId = await loadParentLinksByStudentIds(studentIds);
  const notifications: CreateNotificationInput[] = [];

  for (const studentId of studentIds) {
    const student = usersById.get(studentId);
    if (!student) continue;

    const status = uniqueMarks.get(studentId) ?? "UPDATED";
    const studentDisplay = studentLabel(student);
    const body = `${session.code} - ${session.name} on ${session.attendance_date}`;

    notifications.push({
      userId: studentId,
      category: "ATTENDANCE",
      type: "ATTENDANCE_MARKED",
      title: `Attendance marked: ${status}`,
      body,
      meta: {
        ...notificationHref("/app/attendance"),
        sessionId: input.sessionId,
        studentId,
        status,
        moduleCode: session.code,
        moduleName: session.name,
        attendanceDate: session.attendance_date,
      },
      sourceKey: `attendance:${input.sessionId}:${studentId}:${status}`,
    });

    const parents = parentLinksByStudentId.get(studentId) ?? [];
    for (const parent of parents) {
      notifications.push({
        userId: parent.parent_user_id,
        category: "ATTENDANCE",
        type: "ATTENDANCE_MARKED",
        title: `Attendance update: ${studentDisplay}`,
        body: `${status} for ${body}`,
        meta: {
          ...notificationHref("/app/parent/attendance"),
          sessionId: input.sessionId,
          studentId,
          childId: student.public_student_id ?? student.email,
          status,
          moduleCode: session.code,
          moduleName: session.name,
          attendanceDate: session.attendance_date,
        },
        sourceKey: `attendance:${input.sessionId}:${studentId}:${status}`,
      });
    }
  }

  const createdNotifications = await repos.notifications.createMany(notifications);
  await fanOutWhatsAppSafely(createdNotifications);
}

export async function createResultNotifications(input: {
  resultId: string;
  studentId: string;
  subject: string;
  score: number;
  outOf: number;
  date: string;
  action: "PUBLISHED" | "UPDATED";
}): Promise<void> {
  const usersById = await loadUsersByIds([input.studentId]);
  const student = usersById.get(input.studentId);
  if (!student) return;

  const studentDisplay = studentLabel(student);
  const body = `${input.subject}: ${input.score}/${input.outOf} on ${input.date}`;
  const parents = (await loadParentLinksByStudentIds([input.studentId])).get(input.studentId) ?? [];
  const notifications: CreateNotificationInput[] = [
    {
      userId: input.studentId,
      category: "RESULT",
      type: input.action === "PUBLISHED" ? "RESULT_PUBLISHED" : "RESULT_UPDATED",
      title: input.action === "PUBLISHED" ? `Result published: ${input.subject}` : `Result updated: ${input.subject}`,
      body,
      meta: {
        ...notificationHref("/app/results"),
        resultId: input.resultId,
        studentId: input.studentId,
        subject: input.subject,
        score: input.score,
        outOf: input.outOf,
        assessedAt: input.date,
      },
      sourceKey: `result:${input.resultId}:${input.action.toLowerCase()}`,
    },
  ];

  for (const parent of parents) {
    notifications.push({
      userId: parent.parent_user_id,
      category: "RESULT",
      type: input.action === "PUBLISHED" ? "RESULT_PUBLISHED" : "RESULT_UPDATED",
      title:
        input.action === "PUBLISHED"
          ? `New result for ${studentDisplay}`
          : `Updated result for ${studentDisplay}`,
      body,
      meta: {
        ...notificationHref("/app/parent/results"),
        resultId: input.resultId,
        studentId: input.studentId,
        childId: student.public_student_id ?? student.email,
        subject: input.subject,
        score: input.score,
        outOf: input.outOf,
        assessedAt: input.date,
      },
      sourceKey: `result:${input.resultId}:${input.action.toLowerCase()}`,
    });
  }

  await repos.notifications.createMany(notifications);
}

export async function createParentLinkDecisionNotification(input: {
  requestId: string;
  parentId: string;
  studentId: string;
  decision: "APPROVED" | "REJECTED";
}): Promise<void> {
  const usersById = await loadUsersByIds([input.studentId]);
  const student = usersById.get(input.studentId);
  const childDisplay = student ? studentLabel(student) : "student";

  const createdNotifications = await repos.notifications.createMany([
    {
      userId: input.parentId,
      category: "PARENT_LINK",
      type: "PARENT_LINK_DECIDED",
      title:
        input.decision === "APPROVED"
          ? "Parent link request approved"
          : "Parent link request rejected",
      body: `${childDisplay} link request was ${input.decision.toLowerCase()}.`,
      meta: {
        ...notificationHref("/app/parent/children"),
        requestId: input.requestId,
        studentId: input.studentId,
        childId: student?.public_student_id ?? student?.email ?? null,
        decision: input.decision,
      },
      sourceKey: `parent-link:${input.requestId}:${input.decision.toLowerCase()}`,
    },
  ]);
  await fanOutWhatsAppSafely(createdNotifications);
}

export async function syncFinanceStatusNotificationsForUser(user: {
  id: string;
  role: string;
}): Promise<void> {
  if (String(user.role ?? "").toUpperCase() !== "PARENT") return;

  const result = await pool.query<{
    student_id: string;
    email: string;
    public_student_id: string | null;
    balance_cents: number | null;
    currency: string | null;
  }>(
    `
      SELECT
        s.id AS student_id,
        s.email,
        s.public_student_id,
        fa.balance_cents,
        fa.currency
      FROM parent_links pl
      JOIN users s ON s.id = pl.student_user_id
      LEFT JOIN finance_accounts fa ON fa.user_id = s.id
      WHERE pl.parent_user_id = $1
    `,
    [user.id]
  );

  for (const row of result.rows) {
    const balanceCents = Number(row.balance_cents ?? 0);
    if (balanceCents <= 0) continue;

    const childId = String(row.public_student_id ?? "").trim() || row.email;
    await repos.notifications.upsert({
      userId: user.id,
      category: "FINANCE",
      type: "FINANCE_STATUS",
      title: `Finance overdue: ${childId}`,
      body: `Outstanding balance: ${financeAmount(balanceCents, row.currency ?? "ZAR")}`,
      meta: {
        ...notificationHref("/app/parent/finance"),
        studentId: row.student_id,
        childId,
        balanceCents,
        currency: row.currency ?? "ZAR",
      },
      sourceKey: `finance-overdue:${row.student_id}`,
    });
  }
}
