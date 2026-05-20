import type { NotificationCategory } from "../../persistence/types";
import type { WhatsAppTemplateName } from "./provider";

export const WHATSAPP_SAFE_PREVIEW_TEXT = {
  title: "A new update is available in Forge Communicator.",
  body: "Please open Forge Communicator to view details.",
} as const;

export const WHATSAPP_BLOCKED_CATEGORIES = ["FINANCE", "RESULT", "MESSAGE", "THREAD", "SUPPORT"] as const;

export type WhatsAppTemplateMapping = {
  category: NotificationCategory;
  templateName: WhatsAppTemplateName;
  previewTitle: typeof WHATSAPP_SAFE_PREVIEW_TEXT.title;
  previewBody: typeof WHATSAPP_SAFE_PREVIEW_TEXT.body;
};

const TEMPLATE_BY_CATEGORY: Partial<Record<NotificationCategory, WhatsAppTemplateName>> = {
  ANNOUNCEMENT: "announcement_update",
  EMERGENCY: "emergency_alert",
  ATTENDANCE: "attendance_update",
  PARENT_LINK: "parent_link_update",
};

function normalizeCategory(category: unknown): string {
  return String(category ?? "")
    .trim()
    .toUpperCase();
}

export function mapNotificationCategoryToWhatsAppTemplate(category: unknown): WhatsAppTemplateMapping | null {
  const normalizedCategory = normalizeCategory(category);
  const templateName = TEMPLATE_BY_CATEGORY[normalizedCategory as NotificationCategory];

  if (!templateName) {
    return null;
  }

  return {
    category: normalizedCategory as NotificationCategory,
    templateName,
    previewTitle: WHATSAPP_SAFE_PREVIEW_TEXT.title,
    previewBody: WHATSAPP_SAFE_PREVIEW_TEXT.body,
  };
}
