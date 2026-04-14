export type SupportTicketIssueType =
  | "ACCOUNT_ACCESS"
  | "NETWORK"
  | "POWER"
  | "SOFTWARE"
  | "DEVICE"
  | "OTHER";

export type PulseTicketSyncStatus = "PENDING" | "SYNCED" | "FAILED" | "SKIPPED";

export type ForgeSupportTicketForPulse = {
  id: string;
  requesterEmail: string;
  requesterName: string | null;
  deviceNumber: string | null;
  issueType: SupportTicketIssueType;
  message: string;
};

export type PulseTicketSyncResult = {
  status: PulseTicketSyncStatus;
  externalSystem: "pulse";
  externalReference: string | null;
  syncedAt: string | null;
  error: string | null;
};

type PulseTicketSyncConfig = {
  enabled: boolean;
  formUrl: string;
  timeoutMs: number;
};

const PULSE_ISSUE_TYPE_MAP: Record<SupportTicketIssueType, string> = {
  ACCOUNT_ACCESS: "Login Problems",
  NETWORK: "Network Connection",
  POWER: "Battery/Power",
  SOFTWARE: "Software Issue",
  DEVICE: "Hardware Problem",
  OTHER: "Other",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractCsrfToken(html: string): string | null {
  const match = html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

function extractLaptopOptions(html: string): string[] {
  const selectMatch = html.match(
    /<select[^>]+(?:id=["']laptop_number["']|name=["']laptop_number["'])[\s\S]*?>([\s\S]*?)<\/select>/i
  );
  if (!selectMatch) return [];

  const values = Array.from(
    selectMatch[1].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>/gi)
  )
    .map((match) => normalizeWhitespace(match[1] ?? ""))
    .filter(Boolean);

  return Array.from(new Set(values));
}

function matchPulseLaptopOption(
  deviceNumber: string | null,
  options: string[]
): { value: string; includeDeviceInDescription: boolean } {
  const raw = normalizeWhitespace(String(deviceNumber ?? ""));
  if (!raw) {
    return { value: "", includeDeviceInDescription: false };
  }

  const exact = options.find((option) => option.toLowerCase() === raw.toLowerCase());
  if (exact) {
    return { value: exact, includeDeviceInDescription: false };
  }

  return { value: "", includeDeviceInDescription: true };
}

function buildPulseDescription(
  ticket: ForgeSupportTicketForPulse,
  includeDeviceInDescription: boolean
): string {
  const lines = [ticket.message.trim(), "", "---", "Submitted from Forge Communicator", `Forge ticket ID: ${ticket.id}`];

  if (ticket.requesterName) {
    lines.push(`Name: ${ticket.requesterName}`);
  }

  if (includeDeviceInDescription && ticket.deviceNumber) {
    lines.push(`Device Number: ${ticket.deviceNumber}`);
  }

  return lines.join("\n").trim();
}

function buildAbortSignal(timeoutMs: number): AbortSignal | undefined {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

function extractCookieHeader(headers: Headers): string {
  const cookieReader = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof cookieReader.getSetCookie === "function"
      ? cookieReader.getSetCookie()
      : String(headers.get("set-cookie") ?? "")
          .split(/,(?=[^;]+=[^;]+)/)
          .map((value) => value.trim())
          .filter(Boolean);

  return setCookies
    .map((value) => value.split(";")[0]?.trim() ?? "")
    .filter(Boolean)
    .join("; ");
}

function ensureFormUrl(rawUrl: string): string {
  const value = String(rawUrl ?? "").trim();
  if (!value) {
    throw new Error("Pulse ticket form URL is not configured");
  }
  return value;
}

async function fetchPulseTicketForm(
  config: PulseTicketSyncConfig
): Promise<{ html: string; csrfToken: string; cookieHeader: string; laptopOptions: string[] }> {
  const response = await fetch(config.formUrl, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "ForgeCommunicator/1.0",
    },
    signal: buildAbortSignal(config.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Pulse ticket form returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const csrfToken = extractCsrfToken(html);
  if (!csrfToken) {
    throw new Error("Pulse ticket form did not expose a CSRF token");
  }

  return {
    html,
    csrfToken,
    cookieHeader: extractCookieHeader(response.headers),
    laptopOptions: extractLaptopOptions(html),
  };
}

async function submitPulseTicketForm(
  config: PulseTicketSyncConfig,
  formData: URLSearchParams,
  cookieHeader: string
): Promise<void> {
  const response = await fetch(config.formUrl, {
    method: "POST",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ForgeCommunicator/1.0",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: formData.toString(),
    signal: buildAbortSignal(config.timeoutMs),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Pulse ticket submit returned HTTP ${response.status}`);
  }

  await response.text();
}

export async function syncSupportTicketToPulse(
  ticket: ForgeSupportTicketForPulse,
  config: PulseTicketSyncConfig
): Promise<PulseTicketSyncResult> {
  if (!config.enabled) {
    return {
      status: "SKIPPED",
      externalSystem: "pulse",
      externalReference: null,
      syncedAt: null,
      error: null,
    };
  }

  try {
    const formUrl = ensureFormUrl(config.formUrl);
    const form = await fetchPulseTicketForm({ ...config, formUrl });
    const issueType = PULSE_ISSUE_TYPE_MAP[ticket.issueType];

    if (!issueType) {
      throw new Error(`No Pulse issue type mapping exists for ${ticket.issueType}`);
    }

    const laptop = matchPulseLaptopOption(ticket.deviceNumber, form.laptopOptions);
    const formData = new URLSearchParams();
    formData.set("csrf_token", form.csrfToken);
    formData.set("email", ticket.requesterEmail.trim().toLowerCase());
    formData.set("laptop_number", laptop.value);
    formData.set("issue_type", issueType);
    formData.set("description", buildPulseDescription(ticket, laptop.includeDeviceInDescription));
    formData.set("submit_request", "1");

    await submitPulseTicketForm({ ...config, formUrl }, formData, form.cookieHeader);

    return {
      status: "SYNCED",
      externalSystem: "pulse",
      externalReference: null,
      syncedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "FAILED",
      externalSystem: "pulse",
      externalReference: null,
      syncedAt: null,
      error: message.slice(0, 500),
    };
  }
}
