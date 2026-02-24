import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useCalendarApi } from "../hooks/useCalendarApi";

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Calendar() {
  const { role, canCreate, canDelete, loading, error, grouped, reload, create, remove, toLocalInputValue } =
    useCalendarApi();

  const subtitle = useMemo(() => {
    if (role === "PARENT") return "View-only calendar.";
    return "Your calendar entries (stored in PostgreSQL).";
  }, [role]);

  const now = new Date();
  const startDefault = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const endDefault = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsLocal, setStartsLocal] = useState(toLocalInputValue(startDefault.toISOString()));
  const [endsLocal, setEndsLocal] = useState(toLocalInputValue(endDefault.toISOString()));

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    await create({ title, description, location, startsLocal, endsLocal });
    setTitle("");
    setDescription("");
    setLocation("");
  }

  if (role === "PARENT") return <Navigate to="/app/parent/calendar" replace />;

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={subtitle}
        actions={
          <button
            type="button"
            onClick={reload}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
          >
            Refresh
          </button>
        }
      />

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Create */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <h2 className="text-lg font-semibold">Add an entry</h2>
          <p className="mt-1 text-sm text-slate-300">Saved to PostgreSQL (per-user).</p>

          {!canCreate ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
              Your role cannot create calendar entries.
            </div>
          ) : (
            <form onSubmit={onCreate} className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-slate-300">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                  placeholder="Forge meeting"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-300">Start</label>
                  <input
                    type="datetime-local"
                    value={startsLocal}
                    onChange={(e) => setStartsLocal(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300">End</label>
                  <input
                    type="datetime-local"
                    value={endsLocal}
                    onChange={(e) => setEndsLocal(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-300">Location (optional)</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                  placeholder="Forge Campus"
                />
              </div>

              <div>
                <label className="text-sm text-slate-300">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                  placeholder="Calendar polish test"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold hover:bg-cyan-500 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Saving..." : "Add entry"}
              </button>
            </form>
          )}
        </div>

        {/* List */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Upcoming</h2>
            <span className="text-xs text-slate-400">{loading ? "Loading..." : ""}</span>
          </div>

          {grouped.length === 0 && !loading ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              No calendar entries yet.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {grouped.map(([day, entries]) => (
                <div key={day}>
                  <div className="mb-2 text-xs font-semibold text-slate-300">{day}</div>

                  <div className="space-y-2">
                    {entries.map((it) => (
                      <div
                        key={it.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{it.title}</div>
                            <div className="mt-1 text-xs text-slate-300">
                              {fmt(it.startsAt)} → {fmt(it.endsAt)}
                            </div>
                            {it.location && <div className="mt-1 text-xs text-slate-400">{it.location}</div>}
                            {it.description && (
                              <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
                                {it.description}
                              </div>
                            )}
                          </div>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => remove(it.id)}
                              className="shrink-0 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs hover:bg-slate-900/50"
                              title="Delete"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
