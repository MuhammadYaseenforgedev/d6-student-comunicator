// src/pages/Calendar.tsx
// Calendar page for non-parent roles.
// - Allows eligible users to create calendar entries
// - Lists upcoming calendar entries grouped by day
// - Uses the shared button system for consistent hover and border effects

import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useCalendarApi } from "../hooks/useCalendarApi";

/**
 * Format ISO date strings into a readable local date/time string.
 */
function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Calendar() {
  const {
    role,
    canCreate,
    canDelete,
    loading,
    error,
    grouped,
    reload,
    create,
    remove,
    toLocalInputValue,
  } = useCalendarApi();

  const subtitle = useMemo(() => {
    if (role === "PARENT") return "View-only calendar.";
    return "Your calendar entries (stored in PostgreSQL).";
  }, [role]);

  const now = new Date();
  const startDefault = new Date(now.getTime() + 60 * 60 * 1000);
  const endDefault = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsLocal, setStartsLocal] = useState(
    toLocalInputValue(startDefault.toISOString())
  );
  const [endsLocal, setEndsLocal] = useState(
    toLocalInputValue(endDefault.toISOString())
  );

  /**
   * Submit a new calendar entry, then clear the main text fields.
   */
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
            className="btn-secondary"
            title="Refresh calendar entries"
            aria-label="Refresh calendar entries"
          >
            Refresh
          </button>
        }
      />

      {error && <div className="error-banner mt-3">{error}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Create entry panel */}
        <div className="glass-panel border-[#794DFA]/20 bg-[#794DFA]/08 p-5">
          <h2 className="text-lg font-semibold text-black">Add an entry</h2>
          <p className="mt-1 text-sm text-black">
            Saved to PostgreSQL (per-user).
          </p>

          {!canCreate ? (
            <div className="mt-4 rounded-2xl border border-[#794DFA]/18 bg-white p-3 text-sm text-black">
              Your role cannot create calendar entries.
            </div>
          ) : (
            <form onSubmit={onCreate} className="mt-4 space-y-3">
              <div>
                <label htmlFor="calendar-title" className="text-sm text-black">
                  Title
                </label>
                <input
                  id="calendar-title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-glass mt-1"
                  placeholder="Forge meeting"
                  aria-label="Calendar entry title"
                  title="Calendar entry title"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="calendar-start" className="text-sm text-black">
                    Start
                  </label>
                  <input
                    id="calendar-start"
                    name="startsAt"
                    type="datetime-local"
                    value={startsLocal}
                    onChange={(e) => setStartsLocal(e.target.value)}
                    className="input-glass mt-1"
                    aria-label="Calendar entry start date and time"
                    title="Calendar entry start date and time"
                  />
                </div>

                <div>
                  <label htmlFor="calendar-end" className="text-sm text-black">
                    End
                  </label>
                  <input
                    id="calendar-end"
                    name="endsAt"
                    type="datetime-local"
                    value={endsLocal}
                    onChange={(e) => setEndsLocal(e.target.value)}
                    className="input-glass mt-1"
                    aria-label="Calendar entry end date and time"
                    title="Calendar entry end date and time"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="calendar-location" className="text-sm text-black">
                  Location (optional)
                </label>
                <input
                  id="calendar-location"
                  name="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="input-glass mt-1"
                  placeholder="Forge Campus"
                  aria-label="Calendar entry location"
                  title="Calendar entry location"
                />
              </div>

              <div>
                <label
                  htmlFor="calendar-description"
                  className="text-sm text-black"
                >
                  Description (optional)
                </label>
                <textarea
                  id="calendar-description"
                  name="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="input-glass mt-1"
                  placeholder="Calendar polish test"
                  aria-label="Calendar entry description"
                  title="Calendar entry description"
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
                title="Add calendar entry"
                aria-label="Add calendar entry"
              >
                {loading ? "Saving..." : "Add entry"}
              </button>
            </form>
          )}
        </div>

        {/* Upcoming entries panel */}
        <div className="glass-panel border-[#794DFA]/20 bg-[#794DFA]/08 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black">Upcoming</h2>
            <span className="text-xs text-black">
              {loading ? "Loading..." : ""}
            </span>
          </div>

          {grouped.length === 0 && !loading ? (
            <div className="mt-4 rounded-2xl border border-[#794DFA]/18 bg-white p-4 text-sm text-black">
              No calendar entries yet.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {grouped.map(([day, entries]) => (
                <div key={day}>
                  <div className="mb-2 text-xs font-semibold text-black">
                    {day}
                  </div>

                  <div className="space-y-2">
                    {entries.map((it) => (
                      <div
                        key={it.id}
                        className="rounded-2xl border border-[#794DFA]/18 bg-white p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[#794DFA]/35 hover:bg-[#794DFA]/06 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-black">
                              {it.title}
                            </div>
                            <div className="mt-1 text-xs text-black">
                              {fmt(it.startsAt)} → {fmt(it.endsAt)}
                            </div>
                            {it.location && (
                              <div className="mt-1 text-xs text-black">
                                {it.location}
                              </div>
                            )}
                            {it.description && (
                              <div className="mt-2 whitespace-pre-wrap text-sm text-black">
                                {it.description}
                              </div>
                            )}
                          </div>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => remove(it.id)}
                              className="btn-danger shrink-0 px-3 py-2 text-xs"
                              title="Delete calendar entry"
                              aria-label={`Delete calendar entry ${it.title}`}
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