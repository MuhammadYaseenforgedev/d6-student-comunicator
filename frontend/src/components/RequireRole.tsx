// src/components/RequireRole.tsx
// Route guard: only allow users with specific roles into nested routes.

import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { AdminScope, UserRole } from "../lib/auth";
import { getUser } from "../lib/auth";
import { getEffectiveAdminScope, isFinanceAdmin } from "../lib/adminAccess";

type Props = {
  roles: UserRole[];
  adminScopes?: AdminScope[];
};

export default function RequireRole({ roles, adminScopes }: Props) {
  const location = useLocation();
  const user = getUser();

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  const effectiveAdminScope = getEffectiveAdminScope(user);
  if (
    user.role === "ADMIN" &&
    adminScopes?.length &&
    !adminScopes.includes(effectiveAdminScope ?? "SUPER")
  ) {
    return (
      <Navigate
        to={isFinanceAdmin(user) ? "/app/admin/finance" : "/app"}
        replace
        state={{ from: location.pathname + location.search, forbidden: true }}
      />
    );
  }

  if (!roles.includes(user.role)) {
    const fallbackTo =
      user.role === "PARENT"
        ? "/app/parent"
        : isFinanceAdmin(user)
          ? "/app/admin/finance"
          : "/app";
    return (
      <Navigate
        to={fallbackTo}
        replace
        state={{ from: location.pathname + location.search, forbidden: true }}
      />
    );
  }

  return <Outlet />;
}
