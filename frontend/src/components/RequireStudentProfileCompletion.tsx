import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getToken, getUser } from "../lib/auth";
import { getMyStudentProfile } from "../lib/studentProfileApi";

export default function RequireStudentProfileCompletion() {
  const location = useLocation();
  const user = getUser();
  const token = getToken();
  const isMockDemo = token?.startsWith("mock-demo-token-") ?? false;
  const [loading, setLoading] = useState(user?.role === "STUDENT");
  const [isComplete, setIsComplete] = useState<boolean>(user?.role !== "STUDENT");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "STUDENT") {
      setLoading(false);
      setIsComplete(true);
      setError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getMyStudentProfile();
        if (!cancelled) {
          setIsComplete(Boolean(data.profile.isComplete));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load your personal details");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  if (user?.role !== "STUDENT" || isMockDemo) {
    return <Outlet />;
  }

  if (loading) {
    return <div className="info-banner">Checking your personal details...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  if (!isComplete) {
    return (
      <Navigate
        to="/app/personal-details"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}
