import { env } from "../../config/env";
import { repos } from "../../persistence";
import type {
  NotificationCategory,
  NotificationDelivery,
  NotificationDeliveryProvider,
  NotificationDeliveryRepo,
} from "../../persistence/types";
import { dryRunWhatsAppProvider } from "./dryRunProvider";
import type { WhatsAppProvider, WhatsAppTemplateName } from "./provider";

type WhatsAppDeliveryConfig = {
  enabled: boolean;
  dryRun: boolean;
  provider: NotificationDeliveryProvider;
  allowedCategories: NotificationCategory[];
};

export type SendWhatsAppForNotificationInput = {
  notificationId?: string | null;
  userId: string;
  category: NotificationCategory;
};

export type WhatsAppDeliveryDecision =
  | "SKIPPED_DISABLED"
  | "SKIPPED_CATEGORY"
  | "SKIPPED_NO_PREFERENCE"
  | "SKIPPED_NOT_OPTED_IN"
  | "SKIPPED_OPTED_OUT"
  | "SKIPPED_NO_DRY_RUN"
  | "DRY_RUN";

export type WhatsAppDeliveryResult = {
  decision: WhatsAppDeliveryDecision;
  delivery: NotificationDelivery | null;
};

type SendDeps = {
  config?: WhatsAppDeliveryConfig;
  deliveryRepo?: NotificationDeliveryRepo;
  provider?: WhatsAppProvider;
};

const TEMPLATE_BY_CATEGORY: Partial<Record<NotificationCategory, WhatsAppTemplateName>> = {
  ANNOUNCEMENT: "announcement_update",
  EMERGENCY: "emergency_alert",
  ATTENDANCE: "attendance_update",
  PARENT_LINK: "parent_link_update",
};

function getDefaultConfig(): WhatsAppDeliveryConfig {
  return {
    enabled: env.WHATSAPP_ENABLED,
    dryRun: env.WHATSAPP_DRY_RUN,
    provider: env.WHATSAPP_PROVIDER,
    allowedCategories: env.WHATSAPP_ALLOWED_CATEGORIES as NotificationCategory[],
  };
}

function isAllowedCategory(category: NotificationCategory, config: WhatsAppDeliveryConfig): boolean {
  return config.allowedCategories.includes(category) && Boolean(TEMPLATE_BY_CATEGORY[category]);
}

async function createSkippedDelivery(
  repo: NotificationDeliveryRepo,
  input: SendWhatsAppForNotificationInput,
  config: WhatsAppDeliveryConfig,
  errorCode: string,
  templateName?: WhatsAppTemplateName | null
): Promise<NotificationDelivery> {
  return repo.createDeliveryAttempt({
    notificationId: input.notificationId ?? null,
    userId: input.userId,
    channel: "WHATSAPP",
    provider: config.provider,
    templateName: templateName ?? null,
    status: "SKIPPED",
    errorCode,
  });
}

export async function sendWhatsAppForNotification(
  input: SendWhatsAppForNotificationInput,
  deps: SendDeps = {}
): Promise<WhatsAppDeliveryResult> {
  const config = deps.config ?? getDefaultConfig();
  const deliveryRepo = deps.deliveryRepo ?? repos.notificationDeliveries;
  const provider = deps.provider ?? dryRunWhatsAppProvider;
  const templateName = TEMPLATE_BY_CATEGORY[input.category] ?? null;

  if (!config.enabled) {
    return {
      decision: "SKIPPED_DISABLED",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_DISABLED", templateName),
    };
  }

  if (!isAllowedCategory(input.category, config)) {
    return {
      decision: "SKIPPED_CATEGORY",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_CATEGORY_NOT_ALLOWED", null),
    };
  }
  if (!templateName) {
    return {
      decision: "SKIPPED_CATEGORY",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_CATEGORY_NOT_ALLOWED", null),
    };
  }

  if (!config.dryRun) {
    return {
      decision: "SKIPPED_NO_DRY_RUN",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_REAL_SEND_NOT_IMPLEMENTED", templateName),
    };
  }

  const preference = await deliveryRepo.getContactPreferenceForUser(input.userId);
  if (!preference) {
    return {
      decision: "SKIPPED_NO_PREFERENCE",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_NO_CONTACT_PREFERENCE", templateName),
    };
  }

  if (!preference.whatsappEnabled || !preference.whatsappPhoneE164 || !preference.whatsappOptedInAt) {
    return {
      decision: "SKIPPED_NOT_OPTED_IN",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_NOT_OPTED_IN", templateName),
    };
  }

  if (preference.whatsappOptedOutAt) {
    return {
      decision: "SKIPPED_OPTED_OUT",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_OPTED_OUT", templateName),
    };
  }

  const providerResult = await provider.sendTemplateMessage({
    toE164: preference.whatsappPhoneE164,
    templateName,
  });

  const delivery = await deliveryRepo.createDeliveryAttempt({
    notificationId: input.notificationId ?? null,
    userId: input.userId,
    channel: "WHATSAPP",
    provider: provider.provider,
    templateName,
    status: providerResult.status,
    providerMessageId: providerResult.providerMessageId,
  });

  return { decision: "DRY_RUN", delivery };
}
