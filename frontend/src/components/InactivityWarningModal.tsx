type Props = {
  open: boolean;
  remainingSeconds: number;
  onStayLoggedIn: () => void;
  onLogOutNow: () => void;
};

function formatRemainingTime(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, remainingSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function InactivityWarningModal({
  open,
  remainingSeconds,
  onStayLoggedIn,
  onLogOutNow,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020C2A]/78 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-warning-title"
      aria-describedby="inactivity-warning-description"
    >
      <div className="glass-panel-strong w-full max-w-md p-6 text-white shadow-[0_0_28px_rgba(140,235,255,0.12),0_20px_45px_rgba(3,10,28,0.46)]">
        <div className="rounded-2xl border border-[#FFB457]/20 bg-[rgba(84,45,7,0.24)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#FFD28A]">
          Inactivity warning
        </div>

        <h2
          id="inactivity-warning-title"
          className="mt-4 text-xl font-semibold text-white"
        >
          You&apos;ll be logged out soon
        </h2>

        <p
          id="inactivity-warning-description"
          className="mt-3 text-sm leading-6 text-white/76"
        >
          You&apos;ve been inactive for 4 minutes. For security, the app will
          log you out in 1 minute unless you continue your session.
        </p>

        <div className="mt-5 rounded-2xl border border-[#8CEBFF]/18 bg-[rgba(8,18,48,0.62)] p-4 text-center backdrop-blur-xl">
          <div className="text-xs uppercase tracking-[0.22em] text-white/52">
            Time remaining
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#8CEBFF]">
            {formatRemainingTime(remainingSeconds)}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onStayLoggedIn}
            className="btn-primary w-full"
            title="Stay logged in"
            aria-label="Stay logged in"
          >
            Stay logged in
          </button>

          <button
            type="button"
            onClick={onLogOutNow}
            className="btn-secondary w-full"
            title="Log out now"
            aria-label="Log out now"
          >
            Log out now
          </button>
        </div>
      </div>
    </div>
  );
}
