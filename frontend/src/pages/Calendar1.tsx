// src/pages/Calendar1.tsx
import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import StudentNoteModal from "../components/StudentNoteModal";
import { useCalendar } from "../hooks/useCalendar";
import type { CalendarEvent } from "../lib/types";

function badgeFor(cat?: CalendarEvent["category"]) {
  if (cat === "EXAM") return "border-red-300 bg-red-50 text-red-700";
  if (cat === "ASSESSMENT") return "border-yellow-300 bg-yellow-50 text-yellow-800";
  if (cat === "HOLIDAY") return "border-green-300 bg-green-50 text-green-800";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

export default function Calendar() {
  const {
    events,
    notes,
    loading,
    error,
    reload,
    createEvent,
    createNote,
    removeNote,
    canCampusUpload,
    canStudentNotes,
    role,
  } = useCalendar();

  // Campus upload form (admin/lecturer only in MVP)
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evCategory, setEvCategory] = useState<CalendarEvent["category"]>("GENERAL");
  const [evDesc, setEvDesc] = useState("");

  // Student note modal state
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDate, setNoteDate] = useState<string>("");
  const [noteEventId, setNoteEventId] = useState<string | undefined>(undefined);
  const [noteEventTitle, setNoteEventTitle] = useState<string | undefined>(undefined);

  const subtitle = useMemo(() => {
    if (canCampusUpload) {
      return "Campus calendar (you can upload events in this dev MVP). Students can add personal notes.";
    }
    if (role === "STUDENT") {
      return "Campus calendar. You can add personal notes, but you cannot edit the calendar.";
    }
    return "Campus calendar (view only).";
  }, [canCampusUpload, role]);

  // Group events by date for a clean UI
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  function openNoteFor(date: string, event?: CalendarEvent) {
    setNoteDate(date);
    setNoteEventId(event?.id);
    setNoteEventTitle(event?.title);
    setNoteOpen(true);
  }

  async function submitCampusEvent(e: React.FormEvent) {
    e.preventDefault();
    const t = evTitle.trim();
    if (!t) return;

    await createEvent({
      title: t,
      description: evDesc.trim(),
      date: evDate,
      category: evCategory,
    });

    // Reset minimal fields
    setEvTitle("");
    setEvDesc("");
  }

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

      {error && <div className="mt-5 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* Left: Campus upload OR student note help */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          {canCampusUpload ? (
            <>
              <div className="text-lg font-semibold text-white">Campus upload</div>
              <div className="mt-1 text-sm text-slate-400">
                In production this will be an admin/campus upload tool.
              </div>

              <form onSubmit={submitCampusEvent} className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm text-slate-300">Title</label>
                  <input
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="e.g. Exam: Maths Paper 1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300">Date</label>
                  <input
                    type="date"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300">Category</label>
                  <select
                    value={evCategory}
                    onChange={(e) => setEvCategory(e.target.value as CalendarEvent["category"])}
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="GENERAL">General</option>
                    <option value="ASSESSMENT">Assessment</option>
                    <option value="EXAM">Exam</option>
                    <option value="HOLIDAY">Holiday</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-300">Description (optional)</label>
                  <textarea
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Extra info…"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 py-3 font-semibold hover:bg-blue-700"
                >
                  Publish event
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-white">Student notes</div>
              <div className="mt-1 text-sm text-slate-400">
                Students can add personal notes to dates/events (does not change the campus calendar).
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                {canStudentNotes ? (
                  <div>
                    Tip: Open any date/event on the right and tap <span className="text-white font-semibold">Add note</span>.
                  </div>
                ) : (
                  <div>
                    Notes are available to students only (as requested).
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-white">Your notes</div>
                <div className="mt-2 space-y-2">
                  {notes.length === 0 ? (
                    <div className="text-sm text-slate-400">No notes yet.</div>
                  ) : (
                    notes.slice(0, 6).map((n) => (
                      <div key={n.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="text-xs text-slate-400">{n.date}</div>
                        <div className="mt-1 text-sm text-slate-200">{n.body}</div>
                        <button
                          type="button"
                          onClick={() => removeNote(n.id)}
                          className="mt-2 text-xs text-red-300 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Calendar events list */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-white">Campus calendar</div>
              <div className="mt-1 text-sm text-slate-400">Everyone can view this.</div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="text-slate-400">Loading…</div>
            ) : grouped.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-slate-300">
                No calendar events yet.
              </div>
            ) : (
              grouped.map(([date, dayEvents]) => (
                <div key={date} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-white font-semibold">{date}</div>

                    {/* Students: add a date note */}
                    {canStudentNotes && (
                      <button
                        type="button"
                        onClick={() => openNoteFor(date)}
                        className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs hover:bg-slate-900/50"
                      >
                        Add note
                      </button>
                    )}
                  </div>

                  <div className="mt-3 space-y-3">
                    {dayEvents.map((ev) => (
                      <div key={ev.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-white font-semibold">{ev.title}</div>
                            {ev.description && (
                              <div className="mt-1 text-sm text-slate-300">{ev.description}</div>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={["inline-flex items-center rounded-full border px-2 py-0.5 text-xs", badgeFor(ev.category)].join(" ")}>
                                {ev.category ?? "GENERAL"}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-xs text-slate-300">
                                Posted by {ev.createdByRole}
                              </span>
                            </div>
                          </div>

                          {/* Students: add note for specific event */}
                          {canStudentNotes && (
                            <button
                              type="button"
                              onClick={() => openNoteFor(date, ev)}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              Note
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Student note modal */}
      <StudentNoteModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        date={noteDate}
        eventTitle={noteEventTitle}
        onCreate={async (body) => {
          await createNote({ date: noteDate, eventId: noteEventId, body });
        }}
      />
    </div>
  );
}
