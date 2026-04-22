function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function toInlineError(error: unknown, fallback: string): string {
  const message = getErrorMessage(error, fallback);
  const upper = message.toUpperCase();

  if (upper.includes("UNAUTHORIZED") || upper.includes("(401)") || upper.includes(" 401")) {
    return "Unauthorized (401): your session expired. Please sign in again.";
  }

  if (upper.includes("FORBIDDEN") || upper.includes("(403)") || upper.includes(" 403")) {
    return "Forbidden (403): you do not have access to this data.";
  }

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return "Network error: could not reach the server. Check backend/API URL.";
  }

  return message;
}
