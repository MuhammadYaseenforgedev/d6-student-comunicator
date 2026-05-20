import type { Notification } from "../../persistence/types";
import { sendWhatsAppForNotification } from "./deliveryService";
import { mapNotificationCategoryToWhatsAppTemplate } from "./templates";

type SendWhatsApp = typeof sendWhatsAppForNotification;
type SafeLogger = Pick<typeof console, "warn">;

type FanoutDeps = {
  send?: SendWhatsApp;
  logger?: SafeLogger;
};

export async function fanOutWhatsAppForNotifications(
  notifications: Notification[],
  deps: FanoutDeps = {}
): Promise<void> {
  const send = deps.send ?? sendWhatsAppForNotification;
  const logger = deps.logger ?? console;
  const safeNotifications = notifications.filter((notification) =>
    Boolean(mapNotificationCategoryToWhatsAppTemplate(notification.category))
  );

  if (safeNotifications.length === 0) return;

  const results = await Promise.allSettled(
    safeNotifications.map((notification) =>
      send({
        notificationId: notification.id,
        userId: notification.userId,
        category: notification.category,
      })
    )
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const notification = safeNotifications[index];
    logger.warn("[notifications] WhatsApp dry-run fan-out failed", {
      notificationId: notification.id,
      category: notification.category,
    });
  });
}
