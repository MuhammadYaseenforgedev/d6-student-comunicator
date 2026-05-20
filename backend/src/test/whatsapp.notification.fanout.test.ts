import type { Notification } from "../persistence/types";
import { fanOutWhatsAppForNotifications } from "../lib/whatsapp/notificationFanout";

function notification(input: Partial<Notification> & Pick<Notification, "id" | "userId" | "category">): Notification {
  return {
    type: "TEST",
    title: "Sensitive title",
    body: "Sensitive body",
    meta: { sensitive: true },
    sourceKey: null,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...input,
  };
}

describe("WhatsApp notification fanout helper", () => {
  test("sends only mapper-allowed notification categories with safe fields", async () => {
    const send = jest.fn().mockResolvedValue({ decision: "DRY_RUN", delivery: null });

    await fanOutWhatsAppForNotifications(
      [
        notification({ id: "allowed-1", userId: "user-1", category: "ANNOUNCEMENT" }),
        notification({ id: "blocked-1", userId: "user-2", category: "RESULT" }),
        notification({ id: "allowed-2", userId: "user-3", category: "PARENT_LINK" }),
      ],
      { send }
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, {
      notificationId: "allowed-1",
      userId: "user-1",
      category: "ANNOUNCEMENT",
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      notificationId: "allowed-2",
      userId: "user-3",
      category: "PARENT_LINK",
    });
    for (const call of send.mock.calls) {
      expect(call[0]).not.toHaveProperty("title");
      expect(call[0]).not.toHaveProperty("body");
      expect(call[0]).not.toHaveProperty("meta");
    }
  });

  test("delivery failures are settled and logged with safe metadata only", async () => {
    const logger = { warn: jest.fn() };
    const send = jest.fn().mockRejectedValue(new Error("provider unavailable"));

    await expect(
      fanOutWhatsAppForNotifications(
        [notification({ id: "allowed-1", userId: "user-1", category: "ATTENDANCE" })],
        { send, logger }
      )
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith("[notifications] WhatsApp dry-run fan-out failed", {
      notificationId: "allowed-1",
      category: "ATTENDANCE",
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("Sensitive body");
  });
});
