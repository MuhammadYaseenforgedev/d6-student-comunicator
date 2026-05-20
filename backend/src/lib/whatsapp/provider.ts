import type { NotificationDeliveryProvider, NotificationDeliveryStatus } from "../../persistence/types";

export type WhatsAppTemplateName =
  | "announcement_update"
  | "emergency_alert"
  | "attendance_update"
  | "parent_link_update";

export type WhatsAppTemplateMessageInput = {
  toE164: string;
  templateName: WhatsAppTemplateName;
};

export type WhatsAppProviderResult = {
  providerMessageId: string | null;
  status: NotificationDeliveryStatus;
};

export type WhatsAppProvider = {
  provider: NotificationDeliveryProvider;
  sendTemplateMessage(input: WhatsAppTemplateMessageInput): Promise<WhatsAppProviderResult>;
};
