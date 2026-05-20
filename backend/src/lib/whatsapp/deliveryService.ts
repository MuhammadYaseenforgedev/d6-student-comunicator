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
import { mapNotificationCategoryToWhatsAppTemplate } from "./templates";

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

function getDefaultConfig(): WhatsAppDeliveryConfig {
  return {
    enabled: env.WHATSAPP_ENABLED,
    dryRun: env.WHATSAPP_DRY_RUN,
    provider: env.WHATSAPP_PROVIDER,
    allowedCategories: env.WHATSAPP_ALLOWED_CATEGORIES as NotificationCategory[],
  };
}

function isAllowedTemplateCategory(category: NotificationCategory, config: WhatsAppDeliveryConfig): boolean {
  return config.allowedCategories.includes(category);
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
  const template = mapNotificationCategoryToWhatsAppTemplate(input.category);
  const templateName = template?.templateName ?? null;

  if (!config.enabled) {
    return {
      decision: "SKIPPED_DISABLED",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_DISABLED", templateName),
    };
  }

  if (!template || !isAllowedTemplateCategory(template.category, config)) {
    return {
      decision: "SKIPPED_CATEGORY",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_CATEGORY_NOT_ALLOWED", null),
    };
  }
  const safeTemplateName = template.templateName;

  if (!config.dryRun) {
    return {
      decision: "SKIPPED_NO_DRY_RUN",
      delivery: await createSkippedDelivery(
        deliveryRepo,
        input,
        config,
        "WHATSAPP_REAL_SEND_NOT_IMPLEMENTED",
        safeTemplateName
      ),
    };
  }

  const preference = await deliveryRepo.getContactPreferenceForUser(input.userId);
  if (!preference) {
    return {
      decision: "SKIPPED_NO_PREFERENCE",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_NO_CONTACT_PREFERENCE", safeTemplateName),
    };
  }

  if (!preference.whatsappEnabled || !preference.whatsappPhoneE164 || !preference.whatsappOptedInAt) {
    return {
      decision: "SKIPPED_NOT_OPTED_IN",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_NOT_OPTED_IN", safeTemplateName),
    };
  }

  if (preference.whatsappOptedOutAt) {
    return {
      decision: "SKIPPED_OPTED_OUT",
      delivery: await createSkippedDelivery(deliveryRepo, input, config, "WHATSAPP_OPTED_OUT", safeTemplateName),
    };
  }

  const providerResult = await provider.sendTemplateMessage({
    toE164: preference.whatsappPhoneE164,
    templateName: safeTemplateName,
  });

  const delivery = await deliveryRepo.createDeliveryAttempt({
    notificationId: input.notificationId ?? null,
    userId: input.userId,
    channel: "WHATSAPP",
    provider: provider.provider,
    templateName: safeTemplateName,
    status: providerResult.status,
    providerMessageId: providerResult.providerMessageId,
  });

  return { decision: "DRY_RUN", delivery };
}
