export type MessagingRole = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

export function toMessagingRole(v: unknown): MessagingRole | null {
  const r = String(v ?? "").trim().toUpperCase();
  if (r === "ADMIN" || r === "LECTURER" || r === "STUDENT" || r === "PARENT") return r;
  return null;
}

export function canMessage(senderRole: MessagingRole, recipientRole: MessagingRole): boolean {
  if (senderRole === "ADMIN") return true;
  if (senderRole === "PARENT") return recipientRole === "LECTURER" || recipientRole === "ADMIN";
  if (senderRole === "STUDENT") return recipientRole === "LECTURER" || recipientRole === "ADMIN";
  if (senderRole === "LECTURER") {
    return recipientRole === "STUDENT" || recipientRole === "PARENT" || recipientRole === "ADMIN";
  }
  return false;
}
