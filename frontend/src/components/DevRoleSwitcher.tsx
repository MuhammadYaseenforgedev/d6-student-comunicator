import {
  getSelectedMockUser,
  isMockMode,
  MOCK_USERS,
  setSelectedMockUser,
  type UserRole,
} from "../lib/auth";

const IS_PROD_BUILD = Boolean(import.meta.env.PROD);

const ROLES: UserRole[] = ["ADMIN", "LECTURER", "STUDENT", "PARENT"];

export default function DevRoleSwitcher() {
  if (!isMockMode() || IS_PROD_BUILD) return null;

  const currentRole = getSelectedMockUser().role;

  function switchRole(role: UserRole) {
    setSelectedMockUser(role);
    window.location.reload();
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[min(92vw,18rem)] rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(6,14,36,0.88)] p-4 text-white shadow-[0_18px_48px_rgba(2,6,23,0.5)] backdrop-blur-2xl">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8CEBFF]">
        Dev Role
      </div>
      <div className="mt-1 text-sm text-white/70">
        {MOCK_USERS[currentRole].email}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => switchRole(role)}
            className={[
              "rounded-2xl border px-3 py-2 text-xs font-semibold transition-all duration-200",
              currentRole === role
                ? "border-[#8CEBFF]/45 bg-[#12376E]/90 text-white"
                : "border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.72)] text-white/80 hover:border-[rgba(140,235,255,0.32)] hover:text-white",
            ].join(" ")}
            title={`Switch to ${role}`}
            aria-label={`Switch to ${role}`}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
  );
}
