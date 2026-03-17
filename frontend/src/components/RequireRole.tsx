// src/components/RequireRole.tsx
// Route guard: only allow users with specific roles into nested routes.

import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { UserRole } from "../lib/auth";
import { getUser } from "../lib/auth";

type Props = {
  roles: UserRole[];
};

export default function RequireRole({ roles }: Props) {
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

  if (!roles.includes(user.role)) {
    const fallbackTo = user.role === "PARENT" ? "/app/parent" : "/app";
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