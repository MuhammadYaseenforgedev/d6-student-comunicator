import { pool } from "../config/db";
import type { NotificationCategory } from "../persistence/types";
import { pgNotificationDeliveryRepo } from "../repos/pgNotificationDeliveryRepo";
import { sendWhatsAppForNotification } from "../lib/whatsapp/deliveryService";
import { cleanupTestUsers, createUser } from "./helpers";

const baseConfig = {
  enabled: true,
  dryRun: true,
  provider: "none" as const,
  allowedCategories: ["ANNOUNCEMENT", "EMERGENCY", "ATTENDANCE", "PARENT_LINK"] as NotificationCategory[],
};

describe("WhatsApp dry-run delivery service", () => {
  afterAll(async () => {
    await cleanupTestUsers();
  });

  async function createNotification(userId: string, category: NotificationCategory): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `
        INSERT INTO user_notifications (
          user_id,
          category,
          type,
          title,
          body,
          meta,
          source_key
        )
        VALUES ($1, $2, 'WHATSAPP_TEST', 'WhatsApp test', 'Sensitive body must stay in-app only', '{}'::jsonb, $3)
        RETURNING id
      `,
      [userId, category, `whatsapp-service-test:${Date.now()}:${Math.random()}`]
    );

    return result.rows[0].id;
  }

  async function upsertPreference(
    userId: string,
    input: {
      phone?: string | null;
      enabled?: boolean;
      optedIn?: boolean;
      optedOut?: boolean;
    }
  ) {
    await pool.query(
      `
        INSERT INTO user_contact_preferences (
          user_id,
          whatsapp_phone_e164,
          whatsapp_enabled,
          whatsapp_opted_in_at,
          whatsapp_opted_out_at,
          source
        )
        VALUES (
          $1,
          $2,
          $3,
          CASE WHEN $4 THEN now() ELSE NULL END,
          CASE WHEN $5 THEN now() ELSE NULL END,
          'test'
        )
        ON CONFLICT (user_id) DO UPDATE
        SET
          whatsapp_phone_e164 = EXCLUDED.whatsapp_phone_e164,
          whatsapp_enabled = EXCLUDED.whatsapp_enabled,
          whatsapp_opted_in_at = EXCLUDED.whatsapp_opted_in_at,
          whatsapp_opted_out_at = EXCLUDED.whatsapp_opted_out_at,
          updated_at = now()
      `,
      [userId, input.phone ?? "+27820000001", Boolean(input.enabled), Boolean(input.optedIn), Boolean(input.optedOut)]
    );
  }

  async function getDeliveryRow(id: string) {
    const result = await pool.query<{
      status: string;
      template_name: string | null;
      provider_message_id: string | null;
      error_code: string | null;
    }>(
      `
        SELECT status, template_name, provider_message_id, error_code
        FROM notification_deliveries
        WHERE id = $1
      `,
      [id]
    );
    return result.rows[0];
  }

  test("WhatsApp disabled records a skipped delivery without provider call", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id, "ANNOUNCEMENT");
    const sendTemplateMessage = jest.fn();

    const result = await sendWhatsAppForNotification(
      { notificationId, userId: user.id, category: "ANNOUNCEMENT" },
      {
        config: { ...baseConfig, enabled: false },
        provider: { provider: "none", sendTemplateMessage },
      }
    );

    expect(result.decision).toBe("SKIPPED_DISABLED");
    expect(result.delivery?.status).toBe("SKIPPED");
    expect(sendTemplateMessage).not.toHaveBeenCalled();

    const row = await getDeliveryRow(result.delivery!.id);
    expect(row.error_code).toBe("WHATSAPP_DISABLED");
    expect(row.template_name).toBe("announcement_update");
  });

  test("missing contact preference is skipped", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id, "ANNOUNCEMENT");

    const result = await sendWhatsAppForNotification(
      { notificationId, userId: user.id, category: "ANNOUNCEMENT" },
      { config: baseConfig }
    );

    expect(result.decision).toBe("SKIPPED_NO_PREFERENCE");
    expect(result.delivery?.status).toBe("SKIPPED");
    expect((await getDeliveryRow(result.delivery!.id)).error_code).toBe("WHATSAPP_NO_CONTACT_PREFERENCE");
  });

  test("disabled preference is skipped", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id, "ATTENDANCE");
    await upsertPreference(user.id, { enabled: false, optedIn: true });

    const result = await sendWhatsAppForNotification(
      { notificationId, userId: user.id, category: "ATTENDANCE" },
      { config: baseConfig }
    );

    expect(result.decision).toBe("SKIPPED_NOT_OPTED_IN");
    expect(result.delivery?.status).toBe("SKIPPED");
    expect((await getDeliveryRow(result.delivery!.id)).template_name).toBe("attendance_update");
  });

  test("opted-out preference is skipped", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id, "PARENT_LINK");
    await upsertPreference(user.id, { enabled: true, optedIn: true, optedOut: true });

    const result = await sendWhatsAppForNotification(
      { notificationId, userId: user.id, category: "PARENT_LINK" },
      { config: baseConfig }
    );

    expect(result.decision).toBe("SKIPPED_OPTED_OUT");
    expect(result.delivery?.status).toBe("SKIPPED");
    expect((await getDeliveryRow(result.delivery!.id)).error_code).toBe("WHATSAPP_OPTED_OUT");
  });

  test("opted-in enabled preference creates dry-run delivery", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id, "EMERGENCY");
    await upsertPreference(user.id, { enabled: true, optedIn: true });
    const sendTemplateMessage = jest.fn().mockResolvedValue({
      providerMessageId: "dryrun_test",
      status: "DRY_RUN",
    });

    const result = await sendWhatsAppForNotification(
      { notificationId, userId: user.id, category: "EMERGENCY" },
      { config: baseConfig, provider: { provider: "none", sendTemplateMessage } }
    );

    expect(result.decision).toBe("DRY_RUN");
    expect(result.delivery?.status).toBe("DRY_RUN");
    expect(result.delivery?.templateName).toBe("emergency_alert");
    expect(result.delivery?.providerMessageId).toBe("dryrun_test");
    expect(sendTemplateMessage).toHaveBeenCalledWith({
      toE164: "+27820000001",
      templateName: "emergency_alert",
    });
    expect(sendTemplateMessage.mock.calls[0][0]).not.toHaveProperty("body");
    expect(sendTemplateMessage.mock.calls[0][0]).not.toHaveProperty("messageBody");
  });

  test("sensitive or disallowed category is skipped before contact lookup", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id, "FINANCE");

    const result = await sendWhatsAppForNotification(
      { notificationId, userId: user.id, category: "FINANCE" },
      { config: baseConfig }
    );

    expect(result.decision).toBe("SKIPPED_CATEGORY");
    expect(result.delivery?.status).toBe("SKIPPED");
    expect(result.delivery?.templateName).toBeNull();
    expect((await getDeliveryRow(result.delivery!.id)).error_code).toBe("WHATSAPP_CATEGORY_NOT_ALLOWED");
  });

  test("delivery rows do not include raw message body or template payload columns", async () => {
    const forbiddenColumns = await pool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notification_deliveries'
          AND column_name = ANY($1::text[])
      `,
      [["message_body", "body", "payload", "template_payload", "auth_token", "bearer_token"]]
    );

    expect(forbiddenColumns.rows[0]?.count).toBe(0);
  });

  test("repo test helper remains usable with service-created rows", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id, "ANNOUNCEMENT");
    await upsertPreference(user.id, { enabled: true, optedIn: true });

    await sendWhatsAppForNotification(
      { notificationId, userId: user.id, category: "ANNOUNCEMENT" },
      { config: baseConfig }
    );

    const deliveries = await pgNotificationDeliveryRepo.listDeliveriesForNotification(notificationId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("DRY_RUN");
    expect(deliveries[0]).not.toHaveProperty("messageBody");
  });
});
