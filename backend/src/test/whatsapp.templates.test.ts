import {
  WHATSAPP_BLOCKED_CATEGORIES,
  WHATSAPP_SAFE_PREVIEW_TEXT,
  mapNotificationCategoryToWhatsAppTemplate,
} from "../lib/whatsapp/templates";

describe("WhatsApp safe category/template mapper", () => {
  test("maps allowed categories to approved template names", () => {
    expect(mapNotificationCategoryToWhatsAppTemplate("ANNOUNCEMENT")).toMatchObject({
      category: "ANNOUNCEMENT",
      templateName: "announcement_update",
    });
    expect(mapNotificationCategoryToWhatsAppTemplate("EMERGENCY")).toMatchObject({
      category: "EMERGENCY",
      templateName: "emergency_alert",
    });
    expect(mapNotificationCategoryToWhatsAppTemplate("ATTENDANCE")).toMatchObject({
      category: "ATTENDANCE",
      templateName: "attendance_update",
    });
    expect(mapNotificationCategoryToWhatsAppTemplate("PARENT_LINK")).toMatchObject({
      category: "PARENT_LINK",
      templateName: "parent_link_update",
    });
  });

  test("returns generic safe preview text for allowed categories", () => {
    const mapping = mapNotificationCategoryToWhatsAppTemplate("ANNOUNCEMENT");

    expect(mapping?.previewTitle).toBe(WHATSAPP_SAFE_PREVIEW_TEXT.title);
    expect(mapping?.previewBody).toBe(WHATSAPP_SAFE_PREVIEW_TEXT.body);
    expect(mapping?.previewTitle).toBe("A new update is available in Forge Communicator.");
    expect(mapping?.previewBody).toBe("Please open Forge Communicator to view details.");
  });

  test("blocks sensitive and unsupported categories", () => {
    for (const category of WHATSAPP_BLOCKED_CATEGORIES) {
      expect(mapNotificationCategoryToWhatsAppTemplate(category)).toBeNull();
    }

    expect(mapNotificationCategoryToWhatsAppTemplate("UNKNOWN")).toBeNull();
    expect(mapNotificationCategoryToWhatsAppTemplate("")).toBeNull();
    expect(mapNotificationCategoryToWhatsAppTemplate(null)).toBeNull();
  });

  test("normalizes category casing without accepting unknown values", () => {
    expect(mapNotificationCategoryToWhatsAppTemplate(" announcement ")?.templateName).toBe("announcement_update");
    expect(mapNotificationCategoryToWhatsAppTemplate(" finance ")).toBeNull();
  });
});
