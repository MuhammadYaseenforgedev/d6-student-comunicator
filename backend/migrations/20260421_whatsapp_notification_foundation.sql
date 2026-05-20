CREATE TABLE IF NOT EXISTS user_contact_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_phone_e164 text NULL,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  whatsapp_opted_in_at timestamptz NULL,
  whatsapp_opted_out_at timestamptz NULL,
  source text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_contact_preferences_user_unique UNIQUE (user_id),
  CONSTRAINT user_contact_preferences_whatsapp_opt_window
    CHECK (
      whatsapp_opted_out_at IS NULL
      OR whatsapp_opted_in_at IS NULL
      OR whatsapp_opted_out_at >= whatsapp_opted_in_at
    )
);

CREATE INDEX IF NOT EXISTS idx_user_contact_preferences_user_id
  ON user_contact_preferences(user_id);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NULL REFERENCES user_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  provider text NOT NULL,
  template_name text NULL,
  status text NOT NULL,
  provider_message_id text NULL,
  error_code text NULL,
  attempted_at timestamptz NULL,
  delivered_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_channel_valid
    CHECK (channel IN ('WHATSAPP')),
  CONSTRAINT notification_deliveries_status_valid
    CHECK (status IN ('PENDING', 'SKIPPED', 'DRY_RUN', 'SENT', 'FAILED', 'DELIVERED'))
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_id
  ON notification_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_id
  ON notification_deliveries(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel_status
  ON notification_deliveries(channel, status);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at
  ON notification_deliveries(created_at DESC);
