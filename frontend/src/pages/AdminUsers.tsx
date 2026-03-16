import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import { deleteAdminAccount, listAdminAccounts, type AdminAccount, type AdminAccountRole } from "../lib/userAdminApi";

type RoleFilter = "ALL" | AdminAccountRole;

const ROLE_FILTERS: Array<{ value: RoleFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "ADMIN", label: "Admins" },
  { value: "LECTURER", label: "Lecturers" },
  { value: "STUDENT", label: "Students" },
  { value: "PARENT", label: "Parents" },
];

function roleTone(role: AdminAccountRole): string {
  if (role === "ADMIN") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
  if (role === "LECTURER") return "border-blue-500/30 bg-blue-500/10 text-blue-100";
  if (role === "STUDENT") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  return "border-amber-500/30 bg-amber-500/10 text-amber-100";
}

function displayName(account: AdminAccount): string {
  const fullName = `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim();
  return fullName || account.email;
}

function secondaryMeta(account: AdminAccount): string {
  if (account.role === "STUDENT") {
    return account.studentNumber?.trim() || account.courseName?.trim() || "Student account";
  }
  if (account.role === "PARENT") {
    return account.canLinkChildren ? "Parent can link children" : "Parent account";
  }
  return account.courseName?.trim() || account.email;
}

function formatTimestamp(raw: string): string {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleString();
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
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
      setError(e instanceof Error ? e.message : "Failed to load registered accounts");
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

    const confirmed = window.confirm(`Delete ${account.email}? This will remove their linked data as well.`);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        subtitle="View all registered admins, lecturers, students, and parents. Admins can remove accounts here."
        actions={
          <button
            type="button"
            onClick={() => {
              void loadAccounts();
            }}
            disabled={loading}
            className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900/70 disabled:opacity-60"
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

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by email, name, course, or student number"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
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
                    "rounded-full border px-3 py-2 text-xs font-semibold transition",
                    active
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-slate-600",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
        {info && (
          <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {info}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Registered accounts</div>
        <div className="mt-1 text-sm text-slate-400">
          {roleFilter === "ALL" ? "Showing every registered role." : `Showing ${roleFilter.toLowerCase()} accounts.`}
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              Loading accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              No accounts matched the current filters.
            </div>
          ) : (
            accounts.map((account) => {
              const isCurrentUser = account.id === currentUser?.id;
              return (
                <div
                  key={account.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-slate-100">{displayName(account)}</div>
                        <span className={["rounded-full border px-2 py-1 text-[11px] font-semibold", roleTone(account.role)].join(" ")}>
                          {account.role}
                        </span>
                        {isCurrentUser && (
                          <span className="rounded-full border border-slate-700 bg-slate-900/40 px-2 py-1 text-[11px] font-semibold text-slate-200">
                            Current account
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-300">{account.email}</div>
                      <div className="text-xs text-slate-400">{secondaryMeta(account)}</div>
                      <div className="text-xs text-slate-500">Created {formatTimestamp(account.createdAt)}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void onDelete(account);
                      }}
                      disabled={busyId === account.id || isCurrentUser}
                      className="rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-950/50 disabled:opacity-60"
                    >
                      {busyId === account.id ? "Deleting..." : "Delete account"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
