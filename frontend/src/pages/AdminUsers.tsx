import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import {
  deleteAdminAccount,
  listAdminAccounts,
  updateAdminAccount,
  type AdminAccount,
  type AdminAccountRole,
} from "../lib/userAdminApi";

type RoleFilter = "ALL" | AdminAccountRole;

const ROLE_FILTERS: Array<{ value: RoleFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "ADMIN", label: "Admins" },
  { value: "LECTURER", label: "Lecturers" },
  { value: "STUDENT", label: "Students" },
  { value: "PARENT", label: "Parents" },
];

const MIN_PASSWORD_LENGTH = 6;

function roleTone(role: AdminAccountRole): string {
  if (role === "ADMIN") {
    return "border-[rgba(140,235,255,0.30)] bg-[rgba(140,235,255,0.14)] text-[#dbfaff]";
  }
  if (role === "LECTURER") {
    return "border-[rgba(79,166,255,0.30)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
  }
  if (role === "STUDENT") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
}

function displayName(account: AdminAccount): string {
  const fullName = `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim();
  return fullName || account.email;
}

function secondaryMeta(account: AdminAccount): string {
  if (account.role === "STUDENT") {
    return account.courseName?.trim() || "Student account";
  }
  if (account.role === "PARENT") {
    return account.canLinkChildren ? "Parent can link children" : "Parent account";
  }
  return account.courseName?.trim() || account.email;
}

function normalizeStudentNumber(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function formatTimestamp(raw: string): string {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleString();
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-panel p-4">
      <div className="text-xs uppercase tracking-wide text-white/55">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

export default function AdminUsers() {
  const currentUser = getUser();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStudentNumber, setEditStudentNumber] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const summary = useMemo(() => {
    return accounts.reduce(
      (acc, account) => {
        acc.total += 1;
        acc[account.role] += 1;
        return acc;
      },
      { total: 0, ADMIN: 0, LECTURER: 0, STUDENT: 0, PARENT: 0 }
    );
  }, [accounts]);

  async function loadAccounts() {
    try {
      setLoading(true);
      setError(null);
      const rows = await listAdminAccounts({
        roles: roleFilter === "ALL" ? undefined : [roleFilter],
        q: search || undefined,
        limit: 500,
      });
      setAccounts(rows);
    } catch (e) {
      setAccounts([]);
      setError(
        e instanceof Error ? e.message : "Failed to load registered accounts"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, search]);

  async function onDelete(account: AdminAccount) {
    if (account.id === currentUser?.id) {
      setError("You cannot delete the account you are currently signed in with.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${account.email}? This will remove their linked data as well.`
    );
    if (!confirmed) return;

    try {
      setBusyId(account.id);
      setError(null);
      setInfo(null);
      await deleteAdminAccount(account.id);
      setInfo(`Deleted ${account.email}.`);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(account: AdminAccount) {
    setEditingId(account.id);
    setEditStudentNumber(account.studentNumber ?? "");
    setEditPassword("");
    setShowPassword(false);
    setError(null);
    setInfo(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditStudentNumber("");
    setEditPassword("");
    setShowPassword(false);
  }

  async function onSave(account: AdminAccount) {
    const nextPassword = editPassword;
    const nextStudentNumber = normalizeStudentNumber(editStudentNumber);
    const currentStudentNumber = normalizeStudentNumber(account.studentNumber);
    const payload: { password?: string; studentNumber?: string } = {};

    if (
      account.role === "STUDENT" &&
      nextStudentNumber !== currentStudentNumber &&
      !nextStudentNumber
    ) {
      setError("Student number is required for student accounts.");
      return;
    }

    if (nextPassword.trim()) {
      if (nextPassword.length < MIN_PASSWORD_LENGTH) {
        setError(`Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      payload.password = nextPassword;
    }

    if (
      account.role === "STUDENT" &&
      nextStudentNumber !== currentStudentNumber
    ) {
      payload.studentNumber = nextStudentNumber;
    }

    if (!payload.password && !payload.studentNumber) {
      setError("Change the student number or enter a new password first.");
      return;
    }

    try {
      setSavingId(account.id);
      setError(null);
      setInfo(null);
      await updateAdminAccount(account.id, payload);
      await loadAccounts();

      const changed: string[] = [];
      if (payload.studentNumber) changed.push("student number");
      if (payload.password) changed.push("password");
      setInfo(
        `Updated ${account.email}${
          changed.length ? ` (${changed.join(" and ")})` : ""
        }.`
      );
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update account");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        subtitle="View all registered accounts, reset passwords, edit student numbers, and remove accounts."
        actions={
          <button
            type="button"
            onClick={() => {
              void loadAccounts();
            }}
            disabled={loading}
            className="btn-secondary min-w-[120px]"
            title="Refresh accounts"
            aria-label="Refresh accounts"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Admins" value={summary.ADMIN} />
        <SummaryCard label="Lecturers" value={summary.LECTURER} />
        <SummaryCard label="Students" value={summary.STUDENT} />
        <SummaryCard label="Parents" value={summary.PARENT} />
      </div>

      <section className="teal-glow-card p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"
          >
            <label htmlFor="accounts-search" className="sr-only">
              Search by email, name, course, or student number
            </label>
            <input
              id="accounts-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by email, name, course, or student number"
              className="input-glass w-full"
              title="Search accounts"
              aria-label="Search accounts"
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary min-w-[110px]"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {ROLE_FILTERS.map((option) => {
              const active = option.value === roleFilter;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRoleFilter(option.value)}
                  className={[
                    "tab-pill",
                    active ? "tab-pill-active" : "tab-pill-idle",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {info && <div className="info-banner">{info}</div>}

        <div className="info-banner border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] text-[#ffe8b0] shadow-none">
          Current passwords cannot be displayed. They are stored securely as
          hashes. Use the edit action to set a new password for an account.
        </div>
      </section>

      <section className="teal-glow-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">
              Registered accounts
            </div>
            <div className="mt-1 text-sm text-white/70">
              {roleFilter === "ALL"
                ? "Showing every registered role."
                : `Showing ${roleFilter.toLowerCase()} accounts.`}
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/70">
            {accounts.length} account(s)
          </div>
        </div>

        <div className="divider-soft my-5" />

        <div className="space-y-3">
          {loading ? (
            <div className="info-banner">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="info-banner">
              No accounts matched the current filters.
            </div>
          ) : (
            accounts.map((account) => {
              const isCurrentUser = account.id === currentUser?.id;

              return (
                <div
                  key={account.id}
                  className="glass-panel p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          {displayName(account)}
                        </div>

                        <span
                          className={[
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            roleTone(account.role),
                          ].join(" ")}
                        >
                          {account.role}
                        </span>

                        {isCurrentUser && (
                          <span className="rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] px-2.5 py-1 text-[11px] font-semibold text-white/80">
                            Current account
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-white/78">{account.email}</div>
                      <div className="text-xs text-white/60">
                        {secondaryMeta(account)}
                      </div>

                      {account.role === "STUDENT" && (
                        <div className="text-xs text-white/72">
                          Student number:{" "}
                          {account.studentNumber?.trim() || "Not set"}
                        </div>
                      )}

                      <div className="text-xs text-white/45">
                        Created {formatTimestamp(account.createdAt)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingId === account.id) {
                            cancelEdit();
                            return;
                          }
                          beginEdit(account);
                        }}
                        disabled={busyId === account.id || savingId === account.id}
                        className="btn-secondary"
                      >
                        {editingId === account.id
                          ? "Close editor"
                          : "Edit account"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void onDelete(account);
                        }}
                        disabled={
                          busyId === account.id ||
                          savingId === account.id ||
                          isCurrentUser
                        }
                        className="btn-danger"
                      >
                        {busyId === account.id ? "Deleting..." : "Delete account"}
                      </button>
                    </div>
                  </div>

                  {editingId === account.id && (
                    <div className="mt-4 rounded-3xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.42)] p-4">
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {account.role === "STUDENT" ? (
                          <div>
                            <label
                              htmlFor={`student-number-${account.id}`}
                              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55"
                            >
                              Student number
                            </label>
                            <input
                              id={`student-number-${account.id}`}
                              value={editStudentNumber}
                              onChange={(e) =>
                                setEditStudentNumber(e.target.value.toUpperCase())
                              }
                              placeholder="Student number"
                              className="input-glass w-full"
                              title="Student number"
                            />
                          </div>
                        ) : (
                          <div className="info-banner text-white/70">
                            Student number editing is only available for student
                            accounts.
                          </div>
                        )}

                        <div>
                          <label
                            htmlFor={`password-${account.id}`}
                            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55"
                          >
                            Set new password
                          </label>
                          <input
                            id={`password-${account.id}`}
                            type={showPassword ? "text" : "password"}
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Leave blank to keep current password"
                            className="input-glass w-full"
                            title="Set new password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            className="mt-2 text-xs font-semibold text-[#8CEBFF] hover:text-white"
                          >
                            {showPassword ? "Hide password" : "Show password"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void onSave(account);
                          }}
                          disabled={savingId === account.id}
                          className="btn-primary"
                        >
                          {savingId === account.id ? "Saving..." : "Save changes"}
                        </button>

                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingId === account.id}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}