import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "../lib/auth";

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const INACTIVITY_WARNING_MS = 60 * 1000;
const INACTIVITY_MESSAGE = "You were logged out due to inactivity.";
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "click",
  "keydown",
  "scroll",
  "touchstart",
] as const;

type UseInactivityLogoutOptions = {
  enabled: boolean;
  timeoutMs?: number;
  warningDurationMs?: number;
  message?: string;
};

type UseInactivityLogoutResult = {
  isWarningOpen: boolean;
  remainingSeconds: number;
  stayLoggedIn: () => void;
  logOutNow: () => void;
};

export default function useInactivityLogout({
  enabled,
  timeoutMs = INACTIVITY_TIMEOUT_MS,
  warningDurationMs = INACTIVITY_WARNING_MS,
  message = INACTIVITY_MESSAGE,
}: UseInactivityLogoutOptions): UseInactivityLogoutResult {
  const navigate = useNavigate();
  const location = useLocation();
  const warningTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const logoutDeadlineRef = useRef<number | null>(null);
  const locationRef = useRef(location.pathname + location.search);
  const normalizedTimeoutMs = Math.max(0, timeoutMs);
  const normalizedWarningMs = Math.max(0, warningDurationMs);
  const effectiveWarningMs = Math.min(normalizedTimeoutMs, normalizedWarningMs);
  const defaultRemainingSeconds = Math.max(
    1,
    Math.ceil(effectiveWarningMs / 1000)
  );
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    defaultRemainingSeconds
  );

  useEffect(() => {
    locationRef.current = location.pathname + location.search;
  }, [location.pathname, location.search]);

  const clearWarningTimer = useCallback(() => {
    if (warningTimerRef.current === null) return;
    window.clearTimeout(warningTimerRef.current);
    warningTimerRef.current = null;
  }, []);

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current === null) return;
    window.clearTimeout(logoutTimerRef.current);
    logoutTimerRef.current = null;
  }, []);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current === null) return;
    window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    clearWarningTimer();
    clearLogoutTimer();
    clearCountdownTimer();
  }, [clearCountdownTimer, clearLogoutTimer, clearWarningTimer]);

  const syncRemainingSeconds = useCallback(() => {
    const deadline = logoutDeadlineRef.current;
    if (deadline === null) {
      setRemainingSeconds(defaultRemainingSeconds);
      return;
    }

    const msRemaining = Math.max(0, deadline - Date.now());
    const nextSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
    setRemainingSeconds(nextSeconds);
  }, [defaultRemainingSeconds]);

  const openWarning = useCallback(() => {
    setIsWarningOpen(true);
    syncRemainingSeconds();
    clearCountdownTimer();
    countdownTimerRef.current = window.setInterval(() => {
      syncRemainingSeconds();
    }, 1000);
  }, [clearCountdownTimer, syncRemainingSeconds]);

  const handleLogout = useCallback(() => {
    clearTimers();
    setIsWarningOpen(false);
    setRemainingSeconds(defaultRemainingSeconds);
    logout(message);
    navigate("/login", {
      replace: true,
      state: { from: locationRef.current },
    });
  }, [clearTimers, defaultRemainingSeconds, message, navigate]);

  const scheduleTimers = useCallback(() => {
    clearTimers();
    logoutDeadlineRef.current = Date.now() + normalizedTimeoutMs;

    warningTimerRef.current = window.setTimeout(() => {
      openWarning();
    }, Math.max(0, normalizedTimeoutMs - effectiveWarningMs));

    logoutTimerRef.current = window.setTimeout(() => {
      handleLogout();
    }, normalizedTimeoutMs);
  }, [
    clearTimers,
    effectiveWarningMs,
    handleLogout,
    normalizedTimeoutMs,
    openWarning,
  ]);

  const resetTimer = useCallback(() => {
    setIsWarningOpen(false);
    setRemainingSeconds(defaultRemainingSeconds);
    scheduleTimers();
  }, [defaultRemainingSeconds, scheduleTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      logoutDeadlineRef.current = null;
      return;
    }

    scheduleTimers();

    function handleActivity() {
      resetTimer();
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      clearTimers();
      logoutDeadlineRef.current = null;
    };
  }, [clearTimers, enabled, resetTimer, scheduleTimers]);

  function stayLoggedIn() {
    if (!enabled) return;
    resetTimer();
  }

  function logOutNow() {
    if (!enabled) return;
    handleLogout();
  }

  return {
    isWarningOpen,
    remainingSeconds,
    stayLoggedIn,
    logOutNow,
  };
}
