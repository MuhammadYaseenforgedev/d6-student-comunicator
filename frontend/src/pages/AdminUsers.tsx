import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import StudentProfileDetailPanel from "../components/StudentProfileDetailPanel";
import { getUser, type AdminScope } from "../lib/auth";
import { adminScopeLabel } from "../lib/adminAccess";
import {
  getStudentProfileDetail,
  type StudentProfileDetail,
} from "../lib/studentProfileApi";
import {
  createAdminAccount,
  deleteAdminAccount,
  downloadStudentNumbersCsv,
  listAdminAccounts,
  updateAdminAccount,
  type AdminAccount,
  type AdminAccountRole,
} from "../lib/userAdminApi";

type RoleFilter = "ALL" | AdminAccountRole;
type AccountType =
  | "STUDENT"
  | "PARENT"
  | "ACADEMIC_ADMIN"
  | "SUPER_ADMIN"
  | "FINANCE_ADMIN";

const ROLE_FILTERS: Array<{ value: RoleFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "ADMIN", label: "Admins" },
  { value: "LECTURER", label: "Legacy Staff" },
  { value: "STUDENT", label: "Students" },
  { value: "PARENT", label: "Parents" },
];

const MIN_PASSWORD_LENGTH = 8;
const ADMIN_SCOPE_OPTIONS: AdminScope[] = ["FINANCE", "ACADEMIC", "SUPER"];
const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> = [
  { value: "STUDENT", label: "Student" },
  { value: "PARENT", label: "Parent" },
  { value: "ACADEMIC_ADMIN", label: "Academic Admin" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "FINANCE_ADMIN", label: "Finance Admin" },
];

function accountTypeToPayload(
  accountType: AccountType
): { role: AdminAccountRole; adminScope?: AdminScope } {
  if (accountType === "ACADEMIC_ADMIN") {
    return { role: "ADMIN", adminScope: "ACADEMIC" };
  }
  if (accountType === "SUPER_ADMIN") {
    return { role: "ADMIN", adminScope: "SUPER" };
  }
  if (accountType === "FINANCE_ADMIN") {
    return { role: "ADMIN", adminScope: "FINANCE" };
  }
  return { role: accountType };
}

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
  if (account.role === "ADMIN") {
    return adminScopeLabel(account.adminScope);
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
  const isLecturerViewer = currentUser?.role === "LECTURER";
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [downloadingStudentCsv, setDownloadingStudentCsv] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [studentProfileOpenId, setStudentProfileOpenId] = useState<string | null>(null);
  const [studentProfileLoadingId, setStudentProfileLoadingId] = useState<string | null>(null);
  const [studentProfiles, setStudentProfiles] = useState<Record<string, StudentProfileDetail>>({});
  const [editStudentNumber, setEditStudentNumber] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editAdminScope, setEditAdminScope] = useState<AdminScope>("ACADEMIC");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("STUDENT");
  const [newSouthAfricanId, setNewSouthAfricanId] = useState("");
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
        roles: isLecturerViewer
          ? ["STUDENT"]
          : roleFilter === "ALL"
            ? undefined
            : [roleFilter],
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
  }, [roleFilter, search, isLecturerViewer]);

  async function onDelete(account: AdminAccount) {
    if (isLecturerViewer) {
      setError("Legacy staff cannot delete accounts.");
      return;
    }

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
      setStudentProfiles((current) => {
        const next = { ...current };
        delete next[account.id];
        return next;
      });
      if (studentProfileOpenId === account.id) {
        setStudentProfileOpenId(null);
      }
      setInfo(`Deleted ${account.email}.`);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(account: AdminAccount) {
    if (isLecturerViewer) {
      setError("Legacy staff can view student accounts but cannot edit account records.");
      return;
    }

    setEditingId(account.id);
    setEditStudentNumber(account.studentNumber ?? "");
    setEditPassword("");
    setEditAdminScope(account.adminScope ?? "SUPER");
    setShowPassword(false);
    setError(null);
    setInfo(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditStudentNumber("");
    setEditPassword("");
    setEditAdminScope("ACADEMIC");
    setShowPassword(false);
  }

  async function toggleStudentProfile(account: AdminAccount) {
    if (account.role !== "STUDENT") return;

    if (studentProfileOpenId === account.id) {
      setStudentProfileOpenId(null);
      return;
    }

    setStudentProfileOpenId(account.id);
    if (studentProfiles[account.id]) return;

    try {
      setStudentProfileLoadingId(account.id);
      setError(null);
      const profile = await getStudentProfileDetail(account.id);
      setStudentProfiles((current) => ({
        ...current,
        [account.id]: profile,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load student profile");
      setStudentProfileOpenId(null);
    } finally {
      setStudentProfileLoadingId(null);
    }
  }

  async function onCreateAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isLecturerViewer) {
      setError("Legacy staff cannot create accounts.");
      return;
    }

    const email = newEmail.trim().toLowerCase();
    const password = newPassword;
    const southAfricanId = String(newSouthAfricanId ?? "").replace(/\D+/g, "");
    const { role: nextRole, adminScope: nextAdminScope } =
      accountTypeToPayload(newAccountType);

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (nextRole === "STUDENT") {
      if (!/^\d{13}$/.test(southAfricanId)) {
        setError("South African ID must be exactly 13 digits for student accounts.");
        return;
      }
    }

    try {
      setCreating(true);
      setError(null);
      setInfo(null);
      await createAdminAccount({
        email,
        password,
        role: nextRole,
        southAfricanId: nextRole === "STUDENT" ? southAfricanId : undefined,
        adminScope: nextRole === "ADMIN" ? nextAdminScope : undefined,
      });
      setNewEmail("");
      setNewPassword("");
      setNewAccountType("STUDENT");
      setNewSouthAfricanId("");
      setInfo(`Created ${email}.`);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function onDownloadStudentCsv() {
    try {
      setDownloadingStudentCsv(true);
      setError(null);
      setInfo(null);
      const { blob, fileName } = await downloadStudentNumbersCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || `student-numbers-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download student numbers CSV");
    } finally {
      setDownloadingStudentCsv(false);
    }
  }

  async function onSave(account: AdminAccount) {
    const nextPassword = editPassword;
    const nextStudentNumber = normalizeStudentNumber(editStudentNumber);
    const currentStudentNumber = normalizeStudentNumber(account.studentNumber);
    const payload: {
      password?: string;
      studentNumber?: string;
      adminScope?: AdminScope;
    } = {};

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

    if (account.role === "ADMIN" && editAdminScope !== (account.adminScope ?? "SUPER")) {
      payload.adminScope = editAdminScope;
    }

    if (!payload.password && !payload.studentNumber && !payload.adminScope) {
      setError("Change the admin access, student number, or password first.");
      return;
    }

    try {
      setSavingId(account.id);
      setError(null);
      setInfo(null);
      await updateAdminAccount(account.id, payload);
      setStudentProfiles((current) => {
        const next = { ...current };
        delete next[account.id];
        return next;
      });
      await loadAccounts();

      const changed: string[] = [];
      if (payload.studentNumber) changed.push("student number");
      if (payload.password) changed.push("password");
      if (payload.adminScope) changed.push("admin access");
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
        subtitle={
          isLecturerViewer
            ? "View student accounts and academic profile details."
            : "View all registered accounts, reset passwords, edit student numbers, and remove accounts."
        }
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

      {!isLecturerViewer && <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Admins" value={summary.ADMIN} />
        <SummaryCard label="Legacy Staff" value={summary.LECTURER} />
        <SummaryCard label="Students" value={summary.STUDENT} />
        <SummaryCard label="Parents" value={summary.PARENT} />
      </div>}

      {!isLecturerViewer && <section className="teal-glow-card p-5 space-y-4">
        <div>
          <div className="text-lg font-semibold text-white">Create Account</div>
          <div className="mt-1 text-sm text-white/72">
            Create protected admin-managed student, parent, academic admin, super admin, and finance admin accounts. Public registration stays limited to safe self-service roles.
          </div>
        </div>

        <form
          onSubmit={onCreateAccount}
          className="grid grid-cols-1 gap-3 xl:grid-cols-2"
        >
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="name@example.com"
            className="input-glass"
            title="Account email"
            aria-label="Account email"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Temporary password"
            className="input-glass"
            title="Temporary password"
            aria-label="Temporary password"
          />
          <select
            value={newAccountType}
            onChange={(e) => setNewAccountType(e.target.value as AccountType)}
            className="select-glass"
            title="Account type"
            aria-label="Account type"
          >
            {ACCOUNT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="info-banner text-white/70">
            {newAccountType === "STUDENT"
              ? "Student numbers are generated automatically. Student accounts need a South African ID."
              : newAccountType === "ACADEMIC_ADMIN" ||
                  newAccountType === "SUPER_ADMIN" ||
                  newAccountType === "FINANCE_ADMIN"
                ? "Admin account type sets the correct admin scope automatically."
                : "This account type uses the selected app role without extra admin access fields."}
          </div>
          {newAccountType === "STUDENT" && (
            <>
              <input
                value={newSouthAfricanId}
                onChange={(e) => setNewSouthAfricanId(e.target.value)}
                placeholder="13-digit South African ID"
                className="input-glass"
                title="South African ID"
                aria-label="South African ID"
              />
            </>
          )}
          <div className="xl:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="btn-primary min-w-[150px] w-full sm:w-auto"
            >
              {creating ? "Creating..." : "Create account"}
            </button>
          </div>
        </form>

        <div className="divider-soft" />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"
          >
            <label htmlFor="accounts-search" className="sr-only">
              Search by email, name, course, student number, or ID number
            </label>
            <input
              id="accounts-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by email, name, course, student number, or ID number"
              className="input-glass w-full"
              title="Search accounts"
              aria-label="Search accounts"
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary min-w-[110px] w-full sm:w-auto"
            >
              Search
            </button>
          </form>

          {!isLecturerViewer && <div className="mobile-chip-row sm:flex sm:flex-wrap sm:gap-2">
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
          </div>}
        </div>

        {error && <div className="error-banner">{error}</div>}
        {info && <div className="info-banner">{info}</div>}

        <div className="info-banner border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] text-[#ffe8b0] shadow-none">
          Current passwords cannot be displayed. They are stored securely as
          hashes. Use the edit action to set a new password for an account.
        </div>

        <div className="info-banner border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] text-white/80 shadow-none">
          Finance Admin can access Finance and Messages. Academic Admin can
          access the academic/admin tools except Finance. Super Admin can
          access the academic/admin tools except Finance.
        </div>
      </section>}

      {isLecturerViewer && (
        <section className="teal-glow-card p-5 space-y-4">
          <div>
            <div className="text-lg font-semibold text-white">Student Accounts</div>
            <div className="mt-1 text-sm text-white/72">
              Legacy staff access is read-only. Account creation, password resets, student number edits, and deletion remain restricted to Academic Admins and Super Admins.
            </div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          {info && <div className="info-banner">{info}</div>}
        </section>
      )}

      <section className="workspace-scroll-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">
              Registered accounts
            </div>
            <div className="mt-1 text-sm text-white/70">
              {isLecturerViewer
                ? "Showing student accounts."
                : roleFilter === "ALL"
                ? "Showing every registered role."
                : `Showing ${roleFilter.toLowerCase()} accounts.`}
            </div>
          </div>

          <div className="workspace-meta-pill">
            {accounts.length} account(s)
          </div>
          {!isLecturerViewer && <button
            type="button"
            onClick={() => {
              void onDownloadStudentCsv();
            }}
            disabled={downloadingStudentCsv}
            className="btn-secondary"
          >
            {downloadingStudentCsv ? "Downloading..." : "Download student CSV"}
          </button>}
        </div>

        <div className="divider-soft my-5" />

        <div className="app-page-scroll space-y-3 max-h-none overflow-visible pr-0 lg:max-h-[26rem] lg:overflow-y-auto lg:pr-1">
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

                        {account.role === "ADMIN" && (
                          <span
                            className={[
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              adminScopeTone(account.adminScope),
                            ].join(" ")}
                          >
                            {adminScopeLabel(account.adminScope)}
                          </span>
                        )}

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
                        <>
                          <div className="text-xs text-white/72">
                            Student number:{" "}
                            {account.studentNumber?.trim() || "Not set"}
                          </div>
                          <div className="text-xs text-white/60">
                            ID number: {account.idNumber?.trim() || "Not set"}
                          </div>
                        </>
                      )}

                      <div className="text-xs text-white/45">
                        Created {formatTimestamp(account.createdAt)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mobile-inline-actions">
                      {account.role === "STUDENT" && (
                        <button
                          type="button"
                          onClick={() => {
                            void toggleStudentProfile(account);
                          }}
                          disabled={studentProfileLoadingId === account.id}
                          className="btn-secondary"
                        >
                          {studentProfileOpenId === account.id
                            ? "Hide student profile"
                            : studentProfileLoadingId === account.id
                              ? "Loading profile..."
                              : "Student profile"}
                        </button>
                      )}

                      {!isLecturerViewer && <button
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
                      </button>}

                      {!isLecturerViewer && <button
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
                      </button>}
                    </div>
                  </div>

                  {account.role === "STUDENT" &&
                    studentProfileOpenId === account.id && (
                      <div className="mt-4 rounded-3xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.42)] p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-white">
                              Student Profile
                            </div>
                            <div className="mt-1 text-sm text-white/68">
                              Personal details and course information linked to this account.
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              void toggleStudentProfile(account);
                            }}
                            className="btn-secondary"
                          >
                            Close
                          </button>
                        </div>

                        {studentProfileLoadingId === account.id ? (
                          <div className="info-banner">Loading student profile...</div>
                        ) : studentProfiles[account.id] ? (
                          <StudentProfileDetailPanel
                            profile={studentProfiles[account.id]}
                          />
                        ) : (
                          <div className="info-banner">
                            Student profile is not available yet.
                          </div>
                        )}
                      </div>
                    )}

                  {editingId === account.id && (
                    <div className="mt-4 rounded-3xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.42)] p-4">
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {account.role === "ADMIN" && (
                          <div>
                            <label
                              htmlFor={`admin-scope-${account.id}`}
                              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55"
                            >
                              Admin access
                            </label>
                            <select
                              id={`admin-scope-${account.id}`}
                              value={editAdminScope}
                              onChange={(e) =>
                                setEditAdminScope(e.target.value as AdminScope)
                              }
                              className="select-glass w-full"
                              title="Admin access"
                            >
                              {ADMIN_SCOPE_OPTIONS.map((scope) => (
                                <option key={scope} value={scope}>
                                  {adminScopeLabel(scope)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

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

                      <div className="mt-4 flex flex-wrap gap-2 mobile-inline-actions">
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

function adminScopeTone(scope: AdminScope | null): string {
  if (scope === "FINANCE") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (scope === "ACADEMIC") {
    return "border-[rgba(79,166,255,0.30)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
  }
  return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
}
