import type { AuthUser } from "../middleware/auth";

export const VALID_ADMIN_SCOPES = ["FINANCE", "ACADEMIC", "SUPER"] as const;

export type AdminScope = (typeof VALID_ADMIN_SCOPES)[number];

export function normalizeAdminScope(value: unknown): AdminScope | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return VALID_ADMIN_SCOPES.includes(normalized as AdminScope)
    ? (normalized as AdminScope)
    : null;
}

export function getEffectiveAdminScope(input: {
  role?: string | null;
  adminScope?: unknown;
}): AdminScope | null {
  if (String(input.role ?? "").trim().toUpperCase() !== "ADMIN") return null;
  return normalizeAdminScope(input.adminScope) ?? "SUPER";
}

export function hasAdminScope(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined,
  allowedScopes: readonly AdminScope[]
): boolean {
  if (!user || user.role !== "ADMIN") return false;
  const effectiveScope = getEffectiveAdminScope(user);
  return effectiveScope != null && allowedScopes.includes(effectiveScope);
}

export function isFinanceAdmin(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined
): boolean {
  return hasAdminScope(user, ["FINANCE"]);
}

export function isAcademicOrSuperAdmin(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined
): boolean {
  return hasAdminScope(user, ["ACADEMIC", "SUPER"]);
}
