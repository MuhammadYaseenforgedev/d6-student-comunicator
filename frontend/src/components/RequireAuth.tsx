import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAuthed } from "../lib/auth";
import InactivityWarningModal from "./InactivityWarningModal";
import useInactivityLogout from "../hooks/useInactivityLogout";

export default function RequireAuth() {
  const location = useLocation();
  const authed = isAuthed();

  const { isWarningOpen, remainingSeconds, stayLoggedIn, logOutNow } =
    useInactivityLogout({ enabled: authed });

  if (!authed) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return (
    <>
      <Outlet />
      <InactivityWarningModal
        open={isWarningOpen}
        remainingSeconds={remainingSeconds}
        onStayLoggedIn={stayLoggedIn}
        onLogOutNow={logOutNow}
      />
    </>
  );
}
