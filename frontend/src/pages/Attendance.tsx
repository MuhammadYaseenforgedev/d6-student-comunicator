import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import AttendanceStatusBadge from "../components/AttendanceStatusBadge";
import PageHeader from "../components/PageHeader";
import { isAcademicOrSuperAdmin } from "../lib/adminAccess";
import { getUser } from "../lib/auth";
import {
  checkInToAttendanceSession,
  closeAttendanceSession,
  createAttendanceSession,
  deleteAttendanceSession,
  downloadAttendanceExport,
  getAttendanceSession,
  getMyAttendance,
  listAttendanceModules,
  listAttendanceSessionRoster,
  listAttendanceSessions,
  markAttendanceSession,
  type AttendanceMeResponse,
  type AttendanceModule,
  type AttendanceModuleStudent,
  type AttendanceSession,
  type AttendanceSessionRosterStudent,
  type AttendanceStatus,
} from "../lib/attendanceApi";
import {
  attendanceStatusTextClass,
  normalizeAttendanceStatus,
} from "../lib/attendanceStatus";

type MarkMap = Record<string, AttendanceStatus>;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function roleLabel(role: string): string {
  return String(role ?? "").toUpperCase();
}

function sortStudents<
  T extends Pick<AttendanceModuleStudent, "email" | "firstName" | "lastName">
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aKey =
      `${a.lastName ?? ""} ${a.firstName ?? ""} ${a.email}`.toLowerCase();
    const bKey =
      `${b.lastName ?? ""} ${b.firstName ?? ""} ${b.email}`.toLowerCase();
    return aKey.localeCompare(bKey);
  });
}

function studentDisplayName(student: AttendanceModuleStudent): string {
  return (
    `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.email
  );
}

function studentMeta(student: AttendanceModuleStudent): string {
  return student.studentNumber?.trim() || student.courseName?.trim() || student.email;
}

function formatDateTime(raw: string | null): string {
  if (!raw) return "Not recorded";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleString();
}

function sessionTitle(session: AttendanceSession): string {
  return `${session.moduleCode} - ${session.moduleName}`;
}

function getSessionStatus(session: AttendanceSession): {
  label: "Upcoming" | "Live" | "Closed";
  className: string;
  description: string;
} {
  const now = Date.now();
  const start = session.startsAt ? Date.parse(session.startsAt) : NaN;
  const end = session.endsAt ? Date.parse(session.endsAt) : NaN;
  const openAt = session.attendanceOpenAt ? Date.parse(session.attendanceOpenAt) : NaN;
  const closeAt = session.attendanceCloseAt ? Date.parse(session.attendanceCloseAt) : NaN;

  if (
    session.finalizedAt ||
    (Number.isFinite(closeAt) && now > closeAt) ||
    (Number.isFinite(end) && now > end)
  ) {
    return {
      label: "Closed",
      className: "border-white/15 bg-white/8 text-white/68",
      description: "Attendance is closed for this session.",
    };
  }

  if (
    (Number.isFinite(openAt) && now < openAt) ||
    (Number.isFinite(start) && now < start)
  ) {
    return {
      label: "Upcoming",
      className: "border-amber-400/25 bg-amber-500/12 text-amber-200",
      description: "This session has not opened yet.",
    };
  }

  const withinOpenWindow =
    (!Number.isFinite(openAt) || now >= openAt) &&
    (!Number.isFinite(closeAt) || now <= closeAt);

  if (withinOpenWindow) {
    return {
      label: "Live",
      className: "border-sky-400/25 bg-sky-500/12 text-sky-200",
      description: "Attendance is open for this session.",
    };
  }

  return {
    label: "Closed",
    className: "border-white/15 bg-white/8 text-white/68",
    description: "Attendance is closed for this session.",
  };
}

function isSessionLive(session: AttendanceSession): boolean {
  return getSessionStatus(session).label === "Live";
}

function SessionStatusBadge({ session }: { session: AttendanceSession }) {
  const status = getSessionStatus(session);
  return (
    <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold", status.className].join(" ")}>
      {status.label}
    </span>
  );
}

function AttendanceSummaryPills({ session }: { session: AttendanceSession }) {
  const summary = session.summary;

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.50)] px-2.5 py-1 text-white/72">
        {session.checkedInCount} checked in
      </span>
      {summary && (
        <>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
            {summary.present} present
          </span>
          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-amber-200">
            {summary.late} late
          </span>
          <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-rose-200">
            {summary.absent} absent
          </span>
          {typeof summary.pending === "number" && (
            <span className="rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-white/70">
              {summary.pending} pending
            </span>
          )}
        </>
      )}
    </div>
  );
}

function AttendanceStatusLegend() {
  return (
    <div className="teal-glow-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/58">
        Attendance states
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["PRESENT", "LATE", "ABSENT", "PENDING"] as const).map((status) => (
          <AttendanceStatusBadge key={status} status={status} />
        ))}
      </div>
    </div>
  );
}

function SessionStateLegend() {
  const examples = [
    {
      label: "Upcoming",
      className: "border-amber-400/25 bg-amber-500/12 text-amber-200",
    },
    {
      label: "Live",
      className: "border-sky-400/25 bg-sky-500/12 text-sky-200",
    },
    {
      label: "Closed",
      className: "border-white/15 bg-white/8 text-white/68",
    },
  ];

  return (
    <div className="teal-glow-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/58">
        Session states
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((example) => (
          <span
            key={example.label}
            className={[
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              example.className,
            ].join(" ")}
          >
            {example.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-3xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.50)] p-4"
        >
          <div className="h-4 w-36 rounded-full bg-white/10" />
          <div className="mt-4 h-3 w-2/3 rounded-full bg-white/8" />
          <div className="mt-3 h-3 w-4/5 rounded-full bg-white/8" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.52)] p-4 text-sm text-white/78">
      {message}
    </div>
  );
}

function DetailMeta({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.48)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/52">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

async function triggerAttendanceExport(input: {
  from: string;
  to: string;
  moduleId?: string;
}) {
  const { blob, fileName } = await downloadAttendanceExport(input);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AttendancePage() {
  const user = getUser();
  const role = roleLabel(user?.role ?? "");
  if (role === "LECTURER" || role === "ADMIN") {
    return <StaffAttendanceView />;
  }
  if (role === "PARENT") return <Navigate to="/app/parent/attendance" replace />;
  return <StudentAttendanceView />;
}

function StaffAttendanceView() {
  const user = getUser();
  const [modules, setModules] = useState<AttendanceModule[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [sessionDetail, setSessionDetail] = useState<AttendanceSession | null>(null);
  const [rosterStudents, setRosterStudents] = useState<
    AttendanceSessionRosterStudent[]
  >([]);
  const [marks, setMarks] = useState<MarkMap>({});
  const [moduleId, setModuleId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [date, setDate] = useState(todayDate());
  const [exportFrom, setExportFrom] = useState(defaultFromDate(30));
  const [exportTo, setExportTo] = useState(todayDate());
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);

  const canManageSessionLifecycle = isAcademicOrSuperAdmin(user);

  const selectedSession = useMemo(
    () => sessionDetail ?? sessions.find((session) => session.id === sessionId) ?? null,
    [sessionDetail, sessions, sessionId]
  );

  async function loadModules() {
    const rows = await listAttendanceModules();
    setModules(rows);
    if (!moduleId && rows[0]?.id) setModuleId(rows[0].id);
  }

  async function loadSessions(currentModuleId: string) {
    if (!currentModuleId) {
      setSessions([]);
      setSessionId("");
      setSessionDetail(null);
      setSessionsLoading(false);
      return;
    }
    try {
      setSessionsLoading(true);
      const rows = await listAttendanceSessions({ moduleId: currentModuleId });
      setSessions(rows);
      setSessionId((current) =>
        rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? "")
      );
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadRoster(currentSessionId: string) {
    if (!currentSessionId) {
      setRosterStudents([]);
      setMarks({});
      return;
    }
    const rows = sortStudents(await listAttendanceSessionRoster(currentSessionId));
    setRosterStudents(rows);

    const nextMarks: MarkMap = {};
    for (const student of rows) {
      nextMarks[student.id] = student.currentStatus ?? student.suggestedStatus;
    }
    setMarks(nextMarks);
  }

  async function loadSessionDetail(currentSessionId: string) {
    if (!currentSessionId) {
      setSessionDetail(null);
      return;
    }
    const detail = await getAttendanceSession(currentSessionId);
    setSessionDetail(detail);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadModules();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load attendance modules"
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!moduleId) return;
    setError(null);
    setInfo(null);
    setSessionId("");
    setSessionDetail(null);
    setRosterStudents([]);
    setMarks({});
    void loadSessions(moduleId).catch((e: unknown) => {
      setError(
        e instanceof Error ? e.message : "Failed to load attendance sessions"
      );
    });
  }, [moduleId]);

  useEffect(() => {
    if (!sessionId) {
      setSessionDetail(null);
      setRosterStudents([]);
      setMarks({});
      return;
    }
    setDetailLoading(true);
    void Promise.all([loadSessionDetail(sessionId), loadRoster(sessionId)])
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load session detail");
      })
      .finally(() => setDetailLoading(false));
  }, [sessionId]);

  function combineLocalDateTime(dateValue: string, timeValue: string): string | undefined {
    if (!dateValue || !timeValue) return undefined;
    const normalizedTime = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
    const selected = new Date(`${dateValue}T${normalizedTime}`);
    if (Number.isNaN(selected.getTime())) return undefined;
    return selected.toISOString();
  }

  async function createSession() {
    if (!moduleId) return setError("Select a module first.");

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const created = await createAttendanceSession({
        moduleId,
        date,
        startsAt: combineLocalDateTime(date, startsAt),
        endsAt: combineLocalDateTime(date, endsAt),
      });

      setInfo(`Session created for ${created.date}.`);
      await Promise.all([loadModules(), loadSessions(moduleId)]);
      setSessionId(created.id);
      await Promise.all([loadSessionDetail(created.id), loadRoster(created.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  async function refreshSessionState(targetSessionId?: string) {
    await loadSessions(moduleId);
    if (targetSessionId) {
      await Promise.all([loadSessionDetail(targetSessionId), loadRoster(targetSessionId)]);
    }
  }

  async function closeSession(targetSession: AttendanceSession) {
    if (!canManageSessionLifecycle) return;

    try {
      setSessionActionId(targetSession.id);
      setError(null);
      setInfo(null);

      await closeAttendanceSession(targetSession.id);
      setInfo("Attendance session closed.");
      setSessionId(targetSession.id);
      await refreshSessionState(targetSession.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close attendance session");
    } finally {
      setSessionActionId(null);
    }
  }

  async function deleteSession(targetSession: AttendanceSession) {
    if (!canManageSessionLifecycle) return;

    const confirmed = window.confirm(
      `Delete ${sessionTitle(targetSession)} on ${targetSession.date}? Sessions with attendance records or check-ins are blocked.`
    );
    if (!confirmed) return;

    try {
      setSessionActionId(targetSession.id);
      setError(null);
      setInfo(null);

      await deleteAttendanceSession(targetSession.id);
      setInfo("Attendance session deleted.");
      setRosterStudents([]);
      setMarks({});
      setSessionDetail(null);
      setSessionId("");
      await loadSessions(moduleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete attendance session");
    } finally {
      setSessionActionId(null);
    }
  }

  async function submitMarks() {
    if (!sessionId) return setError("Select a session to mark.");
    if (rosterStudents.length === 0) {
      return setError("No enrolled students found for this session.");
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const payload = rosterStudents.map((student) => ({
        studentId: student.id,
        status: marks[student.id] ?? "PRESENT",
      }));

      const result = await markAttendanceSession(sessionId, payload);
      setInfo(`Attendance submitted (${result.count} record(s)).`);
      await Promise.all([loadSessionDetail(sessionId), loadRoster(sessionId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit attendance");
    } finally {
      setBusy(false);
    }
  }

  async function exportAttendanceRange() {
    if (!moduleId) {
      setError("Select a module before exporting attendance.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await triggerAttendanceExport({ from: exportFrom, to: exportTo, moduleId });
      setInfo("Attendance export downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export attendance");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Create attendance sessions and mark student status for the selected module."
      />
      {error && <Alert tone="error" message={error} />}
      {info && <Alert tone="info" message={info} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttendanceStatusLegend />
        <SessionStateLegend />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="teal-glow-card space-y-4 p-5">
          <div className="text-lg font-semibold text-white">Create Session</div>
          <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-3 text-sm text-white/75">
            Staff module selection is global. If the module you need does not
            exist yet, create it from Courses, then return here to create the
            attendance session for the relevant course module.
          </div>

          <Field label="Module" htmlFor="attendance-module">
            <select
              id="attendance-module"
              title="Select attendance module"
              aria-label="Select attendance module"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              className="select-glass"
            >
              {modules.length === 0 ? (
                <option value="">No modules available</option>
              ) : (
                modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} - {m.name} | {m.courseName} ({m.enrolledCount} students)
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="attendance-date">
              <input
                id="attendance-date"
                title="Attendance date"
                aria-label="Attendance date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-glass"
              />
            </Field>

            <Field label="Start (optional)" htmlFor="attendance-start">
              <input
                id="attendance-start"
                title="Attendance start time"
                aria-label="Attendance start time"
                type="time"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="input-glass"
              />
            </Field>

            <Field label="End (optional)" htmlFor="attendance-end">
              <input
                id="attendance-end"
                title="Attendance end time"
                aria-label="Attendance end time"
                type="time"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="input-glass"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={createSession}
            disabled={busy || !moduleId}
            className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Creating..." : "Create Session"}
          </button>
        </div>

        <div className="teal-glow-card space-y-4 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-lg font-semibold text-white">Session List</div>
              <div className="mt-1 text-sm text-white/68">
                Open a session to load its roster and attendance detail.
              </div>
            </div>
            <span className="workspace-meta-pill">{sessions.length} session(s)</span>
          </div>

          <Field label="Session" htmlFor="attendance-session">
            <select
              id="attendance-session"
              title="Select attendance session"
              aria-label="Select attendance session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="select-glass"
            >
              {sessions.length === 0 ? (
                <option value="">No session for selected module</option>
              ) : (
                sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.date} - {session.moduleCode} {session.moduleName} (
                    {session.checkedInCount} checked in)
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1 lg:max-h-[34rem]">
            {sessionsLoading ? (
              <LoadingRows />
            ) : !moduleId ? (
              <div className="info-banner">Select a module to view sessions.</div>
            ) : sessions.length === 0 ? (
              <EmptyState message="No sessions exist for the selected module yet." />
            ) : (
              sessions.map((session) => {
                const isOpen = session.id === sessionId;
                const status = getSessionStatus(session);
                return (
                  <article
                    key={session.id}
                    className={[
                      "rounded-3xl border p-4 transition-all duration-200",
                      isOpen
                        ? "border-[rgba(140,235,255,0.36)] bg-[rgba(14,42,99,0.66)] shadow-[0_0_18px_rgba(140,235,255,0.12)]"
                        : "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.30)] hover:bg-[rgba(10,27,67,0.70)]",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">
                            {sessionTitle(session)}
                          </h3>
                          <SessionStatusBadge session={session} />
                        </div>

                        <div className="text-xs text-white/68">
                          {session.courseName ? `${session.courseName} | ` : ""}
                          {session.facultyName}
                        </div>

                        <div className="text-xs text-white/62">
                          {session.date}
                          {session.startsAt ? ` | Starts: ${formatDateTime(session.startsAt)}` : " | Start time not set"}
                          {session.endsAt ? ` | Ends: ${formatDateTime(session.endsAt)}` : ""}
                        </div>
                        <div className="text-xs text-white/58">
                          {status.description}
                        </div>

                        <AttendanceSummaryPills session={session} />
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3 xl:w-36 xl:shrink-0 xl:flex-col xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
                        <button
                          type="button"
                          onClick={() => setSessionId(session.id)}
                          className={`${isOpen ? "btn-primary" : "btn-secondary"} min-w-[8.25rem] flex-1 px-3 py-2 text-xs xl:w-full xl:flex-none`}
                          title="Open session detail"
                          aria-label="Open session detail"
                        >
                          {isOpen ? "Session open" : "Open session"}
                        </button>
                        {canManageSessionLifecycle && (
                          <>
                            {!session.finalizedAt && (
                              <button
                                type="button"
                                onClick={() => void closeSession(session)}
                                disabled={sessionActionId === session.id}
                                className="btn-secondary min-w-[8.25rem] flex-1 px-3 py-2 text-xs disabled:opacity-60 xl:w-full xl:flex-none"
                                title="Close attendance session"
                                aria-label="Close attendance session"
                              >
                                {sessionActionId === session.id ? "Working..." : "Close session"}
                              </button>
                            )}
                            <div className="w-full border-t border-rose-300/15 pt-2 xl:mt-1">
                              <button
                                type="button"
                                onClick={() => void deleteSession(session)}
                                disabled={sessionActionId === session.id}
                                className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:opacity-60"
                                title="Delete attendance session"
                                aria-label="Delete attendance session"
                              >
                                {sessionActionId === session.id ? "Working..." : "Delete"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="teal-glow-card space-y-4 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Session Detail</div>
            <div className="mt-1 text-sm text-white/68">
              View session information and learner attendance records.
            </div>
          </div>
          {selectedSession && <SessionStatusBadge session={selectedSession} />}
        </div>

        {detailLoading ? (
          <LoadingRows rows={1} />
        ) : selectedSession ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailMeta label="Session" value={sessionTitle(selectedSession)} />
            <DetailMeta
              label="Course / Faculty"
              value={
                <>
                  {selectedSession.courseName ?? "Course not linked"}
                  <span className="block text-xs font-normal text-white/58">
                    {selectedSession.facultyName}
                  </span>
                </>
              }
            />
            <DetailMeta
              label="Date / Time"
              value={
                <>
                  {selectedSession.date}
                  <span className="block text-xs font-normal text-white/58">
                    {selectedSession.startsAt
                      ? `Starts: ${formatDateTime(selectedSession.startsAt)}`
                      : "Start time not set"}
                    {selectedSession.endsAt
                      ? ` | Ends: ${formatDateTime(selectedSession.endsAt)}`
                      : ""}
                  </span>
                </>
              }
            />
            <DetailMeta label="Created" value={formatDateTime(selectedSession.createdAt)} />
          </div>
        ) : (
          <EmptyState message="Select a session to view its detail." />
        )}

        {selectedSession?.summary && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard
              label="Present"
              value={selectedSession.summary.present}
              className={attendanceStatusTextClass("PRESENT")}
            />
            <SummaryCard
              label="Late"
              value={selectedSession.summary.late}
              className={attendanceStatusTextClass("LATE")}
            />
            <SummaryCard
              label="Absent"
              value={selectedSession.summary.absent}
              className={attendanceStatusTextClass("ABSENT")}
            />
            <SummaryCard
              label="Pending"
              value={selectedSession.summary.pending ?? 0}
              className={attendanceStatusTextClass("PENDING")}
            />
            <SummaryCard
              label="Total"
              value={selectedSession.summary.total}
              className="text-white"
            />
          </div>
        )}

        <div>
          <div className="text-sm font-semibold text-white">Student Records</div>
          <div className="mt-1 text-xs text-white/60">
            Existing marking controls are kept here for staff who already have permission.
          </div>
        </div>

        <div className="mobile-table-shell max-h-none overflow-auto rounded-xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] lg:max-h-[420px]">
            {!sessionId ? (
              <div className="p-4 text-sm text-white/80">
                Select a session to load its attendance roster.
              </div>
            ) : rosterStudents.length === 0 ? (
              <div className="p-4 text-sm text-white/80">
                No enrolled students for this session.
              </div>
            ) : (
              <table className="min-w-[44rem] text-sm lg:min-w-full">
                <thead className="bg-[rgba(140,235,255,0.08)] text-white/85">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Student</th>
                    <th className="px-3 py-2 text-left font-medium">Check-in</th>
                    <th className="px-3 py-2 text-left font-medium">Current</th>
                    <th className="px-3 py-2 text-left font-medium">Suggested</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterStudents.map((student) => {
                    const name = studentDisplayName(student);
                    const currentStatus =
                      normalizeAttendanceStatus(student.currentStatus) ?? "PENDING";
                    return (
                      <tr
                        key={student.id}
                        className="border-t border-[rgba(140,235,255,0.12)]"
                      >
                        <td className="px-3 py-2 text-white">
                          <div>{name}</div>
                          <div className="text-xs text-white/60">
                            {studentMeta(student)}
                          </div>
                        </td>

                        <td className="px-3 py-2 text-xs text-white/70">
                          {student.checkedInAt
                            ? formatDateTime(student.checkedInAt)
                            : "Not checked in"}
                        </td>

                        <td className="px-3 py-2 text-xs">
                          <AttendanceStatusBadge status={currentStatus} />
                        </td>

                        <td className="px-3 py-2 text-xs">
                          <AttendanceStatusBadge status={student.suggestedStatus} />
                        </td>

                        <td className="px-3 py-2">
                          <select
                            id={`attendance-status-${student.id}`}
                            title={`Attendance status for ${name}`}
                            aria-label={`Attendance status for ${name}`}
                            value={marks[student.id] ?? "PRESENT"}
                            disabled={Boolean(selectedSession?.finalizedAt)}
                            onChange={(e) =>
                              setMarks((prev) => ({
                                ...prev,
                                [student.id]: e.target.value as AttendanceStatus,
                              }))
                            }
                            className="select-glass px-2 py-1 text-sm"
                          >
                            <option value="PRESENT">Present</option>
                            <option value="ABSENT">Absent</option>
                            <option value="LATE">Late</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <button
            type="button"
            onClick={submitMarks}
            disabled={busy || !sessionId || rosterStudents.length === 0 || Boolean(selectedSession?.finalizedAt)}
            className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
          >
            {selectedSession?.finalizedAt ? "Session Closed" : busy ? "Submitting..." : "Submit Attendance"}
          </button>

          <div className="divider-soft" />

          <div className="text-sm font-semibold text-white">Export Attendance</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Start date" htmlFor="attendance-export-from">
              <input
                id="attendance-export-from"
                title="Attendance export start date"
                aria-label="Attendance export start date"
                type="date"
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
                className="input-glass"
              />
            </Field>
            <Field label="End date" htmlFor="attendance-export-to">
              <input
                id="attendance-export-to"
                title="Attendance export end date"
                aria-label="Attendance export end date"
                type="date"
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
                className="input-glass"
              />
            </Field>
            <div className="sm:self-end">
              <button
                type="button"
                onClick={() => void exportAttendanceRange()}
                disabled={busy || !moduleId || !exportFrom || !exportTo}
                className="btn-secondary w-full px-4 py-2 text-sm disabled:opacity-60"
              >
                {busy ? "Working..." : "Download CSV"}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}

function StudentAttendanceView() {
  const [from, setFrom] = useState(defaultFromDate(30));
  const [to, setTo] = useState(todayDate());
  const [data, setData] = useState<AttendanceMeResponse | null>(null);
  const [modules, setModules] = useState<AttendanceModule[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedModule = useMemo(
    () => modules.find((module) => module.id === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );

  async function loadModuleSessions(currentModuleId: string) {
    if (!currentModuleId) {
      setSessions([]);
      setSessionsLoading(false);
      return;
    }
    try {
      setSessionsLoading(true);
      setSessions(await listAttendanceSessions({ moduleId: currentModuleId }));
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadAttendanceView() {
    try {
      setLoading(true);
      setError(null);
      setInfo(null);

      const [attendance, moduleRows] = await Promise.all([
        getMyAttendance({ from, to }),
        listAttendanceModules(),
      ]);

      setData(attendance);
      setModules(moduleRows);

      const nextModuleId = moduleRows.some(
        (module) => module.id === selectedModuleId
      )
        ? selectedModuleId
        : (moduleRows[0]?.id ?? "");

      setSelectedModuleId(nextModuleId);
      await loadModuleSessions(nextModuleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance");
      setData(null);
      setModules([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  async function onCheckIn(sessionId: string) {
    try {
      setBusySessionId(sessionId);
      setError(null);
      setInfo(null);

      const result = await checkInToAttendanceSession(sessionId);
      setInfo(
        result.created
          ? `Session check-in recorded at ${formatDateTime(result.checkedInAt)}.`
          : `You already checked in at ${formatDateTime(result.checkedInAt)}.`
      );

      await loadModuleSessions(selectedModuleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join attendance session");
    } finally {
      setBusySessionId(null);
    }
  }

  async function onExport() {
    try {
      setLoading(true);
      setError(null);
      setInfo(null);
      await triggerAttendanceExport({ from, to });
      setInfo("Attendance export downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export attendance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAttendanceView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedModuleId) {
      setSessions([]);
      return;
    }
    void loadModuleSessions(selectedModuleId).catch((e: unknown) => {
      setError(
        e instanceof Error ? e.message : "Failed to load attendance sessions"
      );
    });
  }, [selectedModuleId]);

  const summary = data?.summary ?? { present: 0, absent: 0, late: 0, total: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Your attendance summary and session history."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttendanceStatusLegend />
        <SessionStateLegend />
      </div>

      <div className="teal-glow-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            id="attendance-from-date"
            title="Attendance from date"
            aria-label="Attendance from date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-glass"
          />
          <input
            id="attendance-to-date"
            title="Attendance to date"
            aria-label="Attendance to date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-glass"
          />
          <button
            type="button"
            onClick={() => void loadAttendanceView()}
            disabled={loading}
            className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={loading || !from || !to}
            className="btn-secondary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Working..." : "Download CSV"}
          </button>
        </div>
      </div>

      {error && <Alert tone="error" message={error} />}
      {info && <Alert tone="info" message={info} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Present"
          value={summary.present}
          className={attendanceStatusTextClass("PRESENT")}
        />
        <SummaryCard
          label="Late"
          value={summary.late}
          className={attendanceStatusTextClass("LATE")}
        />
        <SummaryCard
          label="Absent"
          value={summary.absent}
          className={attendanceStatusTextClass("ABSENT")}
        />
        <SummaryCard label="Total" value={summary.total} className="text-white" />
      </div>

      <Alert
        tone="info"
        message="When a session is created for one of your modules, join it here to record your check-in time. Academic staff still choose the final attendance status."
      />

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">
          Your enrolled modules
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {loading && modules.length === 0 ? (
            <LoadingRows rows={2} />
          ) : modules.length === 0 ? (
            <EmptyState message="No modules linked to your account yet." />
          ) : (
            modules.map((module) => {
              const isSelected = module.id === selectedModuleId;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedModuleId(module.id)}
                  className={[
                    "rounded-3xl border p-4 text-left transition-all duration-200",
                    isSelected
                      ? "border-[rgba(140,235,255,0.34)] bg-[rgba(14,42,99,0.62)] shadow-[0_0_18px_rgba(140,235,255,0.10)]"
                      : "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.28)] hover:bg-[rgba(10,27,67,0.68)]",
                  ].join(" ")}
                >
                  <div className="font-semibold text-white">
                    {module.code} - {module.name}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {module.facultyName} | {module.courseName}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">
          Sessions for selected module
        </div>
        <div className="mt-1 text-sm text-white/72">
          {selectedModule
            ? `${selectedModule.code} - ${selectedModule.name}`
            : "Select a module to view sessions."}
        </div>

        <div className="mt-3 space-y-2">
          {sessionsLoading ? (
            <LoadingRows />
          ) : !selectedModule ? (
            <div className="text-sm text-white/75">No module selected.</div>
          ) : sessions.length === 0 ? (
            <EmptyState message="No attendance sessions created for this module yet." />
          ) : (
            sessions.map((session) => {
              const status = getSessionStatus(session);
              const canCheckIn = isSessionLive(session) && !session.checkedInAt;
              return (
                <div
                  key={session.id}
                  className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_18px_rgba(140,235,255,0.10)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-white">
                          {sessionTitle(session)}
                        </div>
                        <SessionStatusBadge session={session} />
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        {session.date}
                        {session.courseName ? ` | ${session.courseName}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        {session.startsAt
                          ? `Starts: ${formatDateTime(session.startsAt)}`
                          : "Start time not set"}
                        {session.endsAt
                          ? ` | Ends: ${formatDateTime(session.endsAt)}`
                          : ""}
                      </div>
                      <div className="mt-1 text-xs text-white/70">
                        {session.checkedInAt
                          ? `Checked in: ${formatDateTime(session.checkedInAt)}`
                          : status.description}
                      </div>
                      <div className="mt-2">
                        <AttendanceSummaryPills session={session} />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void onCheckIn(session.id)}
                      disabled={busySessionId === session.id || !canCheckIn}
                      className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
                    >
                      {session.checkedInAt
                        ? "Checked in"
                        : busySessionId === session.id
                        ? "Joining..."
                        : status.label === "Upcoming"
                        ? "Not open yet"
                        : status.label === "Closed"
                        ? "Closed"
                        : "Join session"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Recent Sessions</div>
        <div className="mt-3 space-y-2">
          {loading && !data ? (
            <LoadingRows rows={2} />
          ) : (data?.value ?? []).length === 0 ? (
            <EmptyState message="No attendance records in this range." />
          ) : (
            data!.value.map((row) => (
              <div
                key={`${row.sessionId}-${row.markedAt}`}
                className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_18px_rgba(140,235,255,0.10)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">
                      {row.moduleCode} - {row.moduleName}
                    </div>
                    <div className="text-xs text-white/60">
                      {row.date} | {row.facultyName}
                    </div>
                  </div>
                  <div
                    className={[
                      "text-sm font-semibold",
                      attendanceStatusTextClass(row.status),
                    ].join(" ")}
                  >
                    <AttendanceStatusBadge status={row.status} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/72"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="teal-glow-card p-4">
      <div className="text-xs uppercase tracking-wide text-white/65">{label}</div>
      <div className={["mt-2 text-2xl font-bold", className].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function Alert({
  tone,
  message,
}: {
  tone: "error" | "info";
  message: string;
}) {
  const className =
    tone === "error"
      ? "border-[rgba(255,94,130,0.22)] bg-[rgba(74,10,31,0.72)] text-[#ffe1e8]"
      : "border-[rgba(140,235,255,0.22)] bg-[rgba(12,31,78,0.70)] text-white";

  return (
    <div className={["rounded-2xl border p-3 text-sm", className].join(" ")}>
      {message}
    </div>
  );
}
