import { pool } from "../config/db";
import type {
  CreateNotificationDeliveryAttemptInput,
  NotificationDelivery,
  NotificationDeliveryRepo,
  NotificationDeliveryStatus,
  UpdateNotificationDeliveryStatusInput,
  UserContactPreference,
} from "../persistence/types";

type ContactPreferenceRow = {
  id: string;
  user_id: string;
  whatsapp_phone_e164: string | null;
  whatsapp_enabled: boolean;
  whatsapp_opted_in_at: string | null;
  whatsapp_opted_out_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationDeliveryRow = {
  id: string;
  notification_id: string | null;
  user_id: string;
  channel: "WHATSAPP";
  provider: "none" | "twilio" | "meta";
  template_name: string | null;
  status: NotificationDeliveryStatus;
  provider_message_id: string | null;
  error_code: string | null;
  attempted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapContactPreference(row: ContactPreferenceRow): UserContactPreference {
  return {
    id: row.id,
    userId: row.user_id,
    whatsappPhoneE164: row.whatsapp_phone_e164,
    whatsappEnabled: Boolean(row.whatsapp_enabled),
    whatsappOptedInAt: row.whatsapp_opted_in_at,
    whatsappOptedOutAt: row.whatsapp_opted_out_at,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDelivery(row: NotificationDeliveryRow): NotificationDelivery {
  return {
    id: row.id,
    notificationId: row.notification_id,
    userId: row.user_id,
    channel: row.channel,
    provider: row.provider,
    templateName: row.template_name,
    status: row.status,
    providerMessageId: row.provider_message_id,
    errorCode: row.error_code,
    attemptedAt: row.attempted_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const pgNotificationDeliveryRepo: NotificationDeliveryRepo = {
  async getContactPreferenceForUser(userId: string): Promise<UserContactPreference | null> {
    const result = await pool.query<ContactPreferenceRow>(
      `
        SELECT
          id,
          user_id,
          whatsapp_phone_e164,
          whatsapp_enabled,
          whatsapp_opted_in_at::text AS whatsapp_opted_in_at,
          whatsapp_opted_out_at::text AS whatsapp_opted_out_at,
          source,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM user_contact_preferences
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    return result.rows[0] ? mapContactPreference(result.rows[0]) : null;
  },

  async isWhatsAppOptedIn(userId: string): Promise<boolean> {
    const preference = await this.getContactPreferenceForUser(userId);
    return Boolean(
      preference?.whatsappEnabled &&
        preference.whatsappPhoneE164 &&
        preference.whatsappOptedInAt &&
        !preference.whatsappOptedOutAt
    );
  },

  async createDeliveryAttempt(input: CreateNotificationDeliveryAttemptInput): Promise<NotificationDelivery> {
    const result = await pool.query<NotificationDeliveryRow>(
      `
        INSERT INTO notification_deliveries (
          notification_id,
          user_id,
          channel,
          provider,
          template_name,
          status,
          provider_message_id,
          error_code,
          attempted_at,
          delivered_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          COALESCE($6::text, 'PENDING'),
          $7,
          $8,
          COALESCE($9::timestamptz, now()),
          $10::timestamptz
        )
        RETURNING
          id,
          notification_id,
          user_id,
          channel,
          provider,
          template_name,
          status,
          provider_message_id,
          error_code,
          attempted_at::text AS attempted_at,
          delivered_at::text AS delivered_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
      `,
      [
        input.notificationId ?? null,
        input.userId,
        input.channel,
        input.provider,
        input.templateName ?? null,
        input.status ?? null,
        input.providerMessageId ?? null,
        input.errorCode ?? null,
        input.attemptedAt ?? null,
        input.deliveredAt ?? null,
      ]
    );

    return mapDelivery(result.rows[0]);
  },

  async updateDeliveryStatus(
    id: string,
    input: UpdateNotificationDeliveryStatusInput
  ): Promise<NotificationDelivery | null> {
    const result = await pool.query<NotificationDeliveryRow>(
      `
        UPDATE notification_deliveries
        SET
          status = $2,
          provider_message_id = COALESCE($3, provider_message_id),
          error_code = COALESCE($4, error_code),
          attempted_at = COALESCE($5::timestamptz, attempted_at),
          delivered_at = COALESCE($6::timestamptz, delivered_at),
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          notification_id,
          user_id,
          channel,
          provider,
          template_name,
          status,
          provider_message_id,
          error_code,
          attempted_at::text AS attempted_at,
          delivered_at::text AS delivered_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
      `,
      [
        id,
        input.status,
        input.providerMessageId ?? null,
        input.errorCode ?? null,
        input.attemptedAt ?? null,
        input.deliveredAt ?? null,
      ]
    );

    return result.rows[0] ? mapDelivery(result.rows[0]) : null;
  },

  async listDeliveriesForNotification(notificationId: string): Promise<NotificationDelivery[]> {
    const result = await pool.query<NotificationDeliveryRow>(
      `
        SELECT
          id,
          notification_id,
          user_id,
          channel,
          provider,
          template_name,
          status,
          provider_message_id,
          error_code,
          attempted_at::text AS attempted_at,
          delivered_at::text AS delivered_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM notification_deliveries
        WHERE notification_id = $1
        ORDER BY created_at ASC
      `,
      [notificationId]
    );

    return result.rows.map(mapDelivery);
  },
};
