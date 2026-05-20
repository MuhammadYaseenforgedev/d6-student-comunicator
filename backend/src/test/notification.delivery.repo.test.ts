import { pool } from "../config/db";
import { pgNotificationDeliveryRepo } from "../repos/pgNotificationDeliveryRepo";
import { cleanupTestUsers, createUser } from "./helpers";

describe("Notification delivery repository", () => {
  afterAll(async () => {
    await cleanupTestUsers();
  });

  async function createNotification(userId: string): Promise<string> {
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
        VALUES ($1, 'ANNOUNCEMENT', 'TEST_DELIVERY', 'Delivery test', '', '{}'::jsonb, $2)
        RETURNING id
      `,
      [userId, `delivery-test:${Date.now()}:${Math.random()}`]
    );

    return result.rows[0].id;
  }

  test("reads WhatsApp preferences and computes opt-in eligibility", async () => {
    const user = await createUser("PARENT");

    await expect(pgNotificationDeliveryRepo.getContactPreferenceForUser(user.id)).resolves.toBeNull();
    await expect(pgNotificationDeliveryRepo.isWhatsAppOptedIn(user.id)).resolves.toBe(false);

    await pool.query(
      `
        INSERT INTO user_contact_preferences (
          user_id,
          whatsapp_phone_e164,
          whatsapp_enabled,
          source
        )
        VALUES ($1, '+27820000001', false, 'test')
      `,
      [user.id]
    );

    const disabled = await pgNotificationDeliveryRepo.getContactPreferenceForUser(user.id);
    expect(disabled?.whatsappPhoneE164).toBe("+27820000001");
    expect(disabled?.whatsappEnabled).toBe(false);
    await expect(pgNotificationDeliveryRepo.isWhatsAppOptedIn(user.id)).resolves.toBe(false);

    await pool.query(
      `
        UPDATE user_contact_preferences
        SET whatsapp_enabled = true,
            whatsapp_opted_in_at = now(),
            updated_at = now()
        WHERE user_id = $1
      `,
      [user.id]
    );

    await expect(pgNotificationDeliveryRepo.isWhatsAppOptedIn(user.id)).resolves.toBe(true);

    await pool.query(
      `
        UPDATE user_contact_preferences
        SET whatsapp_opted_out_at = now(),
            updated_at = now()
        WHERE user_id = $1
      `,
      [user.id]
    );

    await expect(pgNotificationDeliveryRepo.isWhatsAppOptedIn(user.id)).resolves.toBe(false);
  });

  test("creates delivery attempts, updates status, and stores metadata only", async () => {
    const user = await createUser("PARENT");
    const notificationId = await createNotification(user.id);

    const created = await pgNotificationDeliveryRepo.createDeliveryAttempt({
      notificationId,
      userId: user.id,
      channel: "WHATSAPP",
      provider: "none",
      templateName: "attendance_reminder",
      status: "DRY_RUN",
      messageBody: "this field must not be persisted",
    } as any);

    expect(created.notificationId).toBe(notificationId);
    expect(created.channel).toBe("WHATSAPP");
    expect(created.provider).toBe("none");
    expect(created.templateName).toBe("attendance_reminder");
    expect(created.status).toBe("DRY_RUN");
    expect(created).not.toHaveProperty("messageBody");

    const updated = await pgNotificationDeliveryRepo.updateDeliveryStatus(created.id, {
      status: "SENT",
      providerMessageId: "provider-message-123",
    });

    expect(updated?.status).toBe("SENT");
    expect(updated?.providerMessageId).toBe("provider-message-123");

    const deliveries = await pgNotificationDeliveryRepo.listDeliveriesForNotification(notificationId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].id).toBe(created.id);
    expect(deliveries[0]).not.toHaveProperty("messageBody");

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
});
