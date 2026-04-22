import type { AdminScope, AuthUser } from "./auth";

export function getEffectiveAdminScope(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined
): AdminScope | null {
  if (!user || user.role !== "ADMIN") return null;
  return user.adminScope ?? "SUPER";
}

export function isFinanceAdmin(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined
): boolean {
  return getEffectiveAdminScope(user) === "FINANCE";
}

export function isAcademicAdmin(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined
): boolean {
  return getEffectiveAdminScope(user) === "ACADEMIC";
}

export function isSuperAdmin(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined
): boolean {
  return getEffectiveAdminScope(user) === "SUPER";
}

export function isAcademicOrSuperAdmin(
  user: Pick<AuthUser, "role" | "adminScope"> | null | undefined
): boolean {
  const scope = getEffectiveAdminScope(user);
  return scope === "ACADEMIC" || scope === "SUPER";
}

export function adminScopeLabel(scope: AdminScope | null | undefined): string {
  if (scope === "FINANCE") return "Finance Admin";
  if (scope === "ACADEMIC") return "Academic Admin";
  return "Super Admin";
}
