import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasDevBypass } from "../lib/auth";

export default function RequireDevBypass() {
  const location = useLocation();

  if (!hasDevBypass()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}
