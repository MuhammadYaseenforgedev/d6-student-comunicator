import crypto from "crypto";
import type { WhatsAppProvider } from "./provider";

export const dryRunWhatsAppProvider: WhatsAppProvider = {
  provider: "none",
  async sendTemplateMessage() {
    return {
      providerMessageId: `dryrun_${crypto.randomUUID()}`,
      status: "DRY_RUN",
    };
  },
};
