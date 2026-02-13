// src/components/RequireRole.tsx
// Route guard: only allow users with specific roles into nested routes.

import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { UserRole } from "../lib/auth";
import { getUser } from "../lib/auth";

type Props = {
  roles: UserRole[]; // allowed roles for this route section
};

export default function RequireRole({ roles }: Props) {
  const location = useLocation();
  const user = getUser();

  // If not logged in, kick to login and remember where they wanted to go.
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // If logged in but wrong role, kick back to app home.
  // (You can later swap this to a real "403 Forbidden" page.)
  if (!roles.includes(user.role)) {
    return (
      <Navigate
        to="/app"
        replace
        state={{ from: location.pathname + location.search, forbidden: true }}
      />
    );
  }

  // Allowed: render nested routes
  return <Outlet />;
}
