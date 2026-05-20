import { useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DatesSetArg, EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import {
  BellRing,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Layers3,
  MapPin,
  PencilLine,
  Plus,
  RefreshCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import { createCalendarFeedToken, type CalendarEntry } from "../../api/calendar";
import { useCalendarApi } from "../../hooks/useCalendarApi";
import type { CourseRecord } from "../../lib/courseApi";
import CalendarEntryEditorModal, {
  type CalendarEntryEditorValues,
} from "./CalendarEntryEditorModal";

type CalendarFilter = "all" | "personal" | "course";
type CalendarView = "dayGridMonth" | "timeGridWeek" | "listMonth";

type Props = {
  childId?: string;
  courseOptions?: CourseRecord[];
};

type EditorState =
  | {
      mode: "create";
      entry: null;
    }
  | {
      mode: "edit";
      entry: CalendarEntry;
    };

const VIEW_OPTIONS: Array<{ value: CalendarView; label: string }> = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "listMonth", label: "Agenda" },
];

function getInitialView(): CalendarView {
  if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
    return "listMonth";
  }
  return "dayGridMonth";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();

  if (sameDay) {
    return `${startDate.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    })} | ${formatCompactTime(start)} - ${formatCompactTime(end)}`;
  }

  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function getEntryTone(entry: CalendarEntry): "personal" | "course" | "channel" {
  if (entry.source === "COURSE_ENTRY") return "course";
  if (entry.source === "CHANNEL_EVENT") return "channel";
  return "personal";
}

function getEntryLabel(entry: CalendarEntry): string {
  if (entry.source === "COURSE_ENTRY") return "Course event";
  if (entry.source === "CHANNEL_EVENT") return "Shared channel event";
  return "Personal event";
}

function getEntryPillClassName(entry: CalendarEntry): string {
  const tone = getEntryTone(entry);

  if (tone === "course") {
    return "border-[rgba(52,211,153,0.24)] bg-[rgba(52,211,153,0.12)] text-[#ddfff5]";
  }

  if (tone === "channel") {
    return "border-[rgba(79,166,255,0.24)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
  }

  return "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] text-white/78";
}

function matchesFilter(entry: CalendarEntry, filter: CalendarFilter) {
  if (filter === "personal") return entry.source === "CALENDAR_ENTRY";
  if (filter === "course") return entry.source === "COURSE_ENTRY";
  return true;
}

function getCourseLabel(entry: CalendarEntry): string | null {
  const code = entry.courseCode?.trim();
  const name = entry.courseName?.trim();
  if (code && name) return `${code} - ${name}`;
  if (code) return code;
  if (name) return name;
  return null;
}

function getRoleNote(role: string) {
  if (role === "ADMIN") {
    return "All currently authorized events stay visible here. Course-linked visibility still follows the existing backend rules.";
  }
  if (role === "LECTURER") {
    return "You see your personal entries plus course-linked items for courses you teach, alongside shared channel events already visible to you.";
  }
  if (role === "PARENT") {
    return "This stays view-only and only shows the selected child's allowed personal and course-linked items.";
  }
  return "Personal entries, enrolled course items, and the shared events you are already allowed to see stay separated but easy to scan.";
}

function renderCalendarEventContent(arg: EventContentArg) {
  const entry = arg.event.extendedProps.entry as CalendarEntry | undefined;
  if (!entry) {
    return (
      <div className="d6-calendar-event-chip">
        <span className="d6-calendar-event-chip__title">{arg.event.title}</span>
      </div>
    );
  }

  const tone = getEntryTone(entry);
  return (
    <div className={`d6-calendar-event-chip d6-calendar-event-chip--${tone}`}>
      <span className="d6-calendar-event-chip__dot" />
      <div className="d6-calendar-event-chip__body">
        {arg.timeText ? (
          <span className="d6-calendar-event-chip__time">{arg.timeText}</span>
        ) : null}
        <span className="d6-calendar-event-chip__title">{arg.event.title}</span>
        {tone !== "personal" && arg.view.type !== "dayGridMonth" ? (
          <span className="d6-calendar-event-chip__meta">
            {tone === "course" ? getCourseLabel(entry) ?? "Course linked" : "Channel feed"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function CalendarWorkspace({ childId, courseOptions = [] }: Props) {
  const {
    role,
    canCreate,
    loading,
    error,
    items,
    reload,
    loadRange,
    create,
    update,
    remove,
  } = useCalendarApi(undefined, childId);

  const calendarRef = useRef<FullCalendar>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  const [currentView, setCurrentView] = useState<CalendarView>(getInitialView);
  const [rangeLabel, setRangeLabel] = useState("Calendar range");
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>("all");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [copyingFeedLink, setCopyingFeedLink] = useState(false);
  const [feedCopyMessage, setFeedCopyMessage] = useState<string | null>(null);
  const [feedCopyWarning, setFeedCopyWarning] = useState<string | null>(null);
  const [fallbackFeedUrl, setFallbackFeedUrl] = useState("");

  const counts = useMemo(() => {
    let personal = 0;
    let course = 0;
    let channel = 0;

    for (const entry of items) {
      if (entry.source === "COURSE_ENTRY") {
        course += 1;
      } else if (entry.source === "CHANNEL_EVENT") {
        channel += 1;
      } else {
        personal += 1;
      }
    }

    return {
      all: items.length,
      personal,
      course,
      channel,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((entry) => matchesFilter(entry, activeFilter));
  }, [activeFilter, items]);

  const eventInputs = useMemo<EventInput[]>(() => {
    return filteredItems.map((entry) => ({
      id: entry.id,
      title: entry.title,
      start: entry.startsAt,
      end: entry.endsAt,
      classNames: ["d6-calendar-event", `d6-calendar-event--${getEntryTone(entry)}`],
      extendedProps: { entry },
    }));
  }, [filteredItems]);

  const focusedEntry =
    filteredItems.find((entry) => entry.id === selectedEntryId) ?? filteredItems[0] ?? null;
  const canAssignCourse = role === "ADMIN" || role === "LECTURER";
  const canManageFocusedEntry =
    Boolean(focusedEntry?.canDelete) && focusedEntry?.source !== "CHANNEL_EVENT";

  async function handleDatesSet(arg: DatesSetArg) {
    setCurrentView(arg.view.type as CalendarView);
    setRangeLabel(arg.view.title);
    await loadRange(arg.start.toISOString(), arg.end.toISOString());
  }

  function handleViewChange(view: CalendarView) {
    calendarRef.current?.getApi().changeView(view);
  }

  function handleEventClick(arg: EventClickArg) {
    const entry = arg.event.extendedProps.entry as CalendarEntry | undefined;
    if (!entry) return;

    setSelectedEntryId(entry.id);

    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      window.requestAnimationFrame(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  async function handleRefresh() {
    await reload();
  }

  async function handleCopyFeedLink() {
    setCopyingFeedLink(true);
    setFeedCopyMessage(null);
    setFeedCopyWarning(null);
    setFallbackFeedUrl("");

    try {
      const { feedUrl } = await createCalendarFeedToken(childId ? { childId } : {});
      if (!feedUrl) throw new Error("Calendar feed link was not returned.");

      try {
        await navigator.clipboard.writeText(feedUrl);
        setFeedCopyMessage("Calendar feed link copied. Keep this private.");
      } catch {
        setFallbackFeedUrl(feedUrl);
        setFeedCopyWarning(
          "Copy this private feed link manually. Anyone with this link can view the included calendar events."
        );
      }
    } catch (e) {
      setFeedCopyWarning(e instanceof Error ? e.message : "Failed to create calendar feed link.");
    } finally {
      setCopyingFeedLink(false);
    }
  }

  function openCreateModal() {
    setEditorState({ mode: "create", entry: null });
  }

  function openEditModal(entry: CalendarEntry) {
    setEditorState({ mode: "edit", entry });
  }

  async function handleEditorSubmit(values: CalendarEntryEditorValues) {
    if (!editorState) return;

    setSavingEntry(true);
    const ok =
      editorState.mode === "create"
        ? await create(values)
        : await update(editorState.entry.id, values);
    setSavingEntry(false);

    if (ok) {
      setEditorState(null);
    }
  }

  async function handleDelete(entry: CalendarEntry) {
    const confirmed = window.confirm(`Delete "${entry.title}" from the calendar?`);
    if (!confirmed) return;

    setDeletingEntry(true);
    const ok = await remove(entry.id);
    setDeletingEntry(false);

    if (ok) {
      setSelectedEntryId(null);
    }
  }

  return (
    <>
      <div className="teal-glow-card flex min-h-0 flex-col p-5">
        <div className="flex min-h-0 flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.58)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72">
                <CalendarDays size={14} />
                Calendar workspace
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white">Plan with context, not clutter</h2>
                <p className="mt-2 text-sm leading-6 text-white/70">{getRoleNote(role)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[420px]">
              <div className="rounded-3xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.52)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
                  All visible
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">{counts.all}</div>
              </div>
              <div className="rounded-3xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.52)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
                  Personal
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">{counts.personal}</div>
              </div>
              <div className="rounded-3xl border border-[rgba(52,211,153,0.18)] bg-[rgba(52,211,153,0.08)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
                  Course
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">{counts.course}</div>
              </div>
              <div className="rounded-3xl border border-[rgba(79,166,255,0.18)] bg-[rgba(79,166,255,0.08)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
                  Shared feed
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">{counts.channel}</div>
              </div>
            </div>
          </div>

          <div className="divider-soft" />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => calendarRef.current?.getApi().prev()}
                  className="btn-secondary px-3 py-2"
                  aria-label="Previous calendar range"
                  title="Previous calendar range"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => calendarRef.current?.getApi().today()}
                  className="btn-secondary px-4 py-2"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => calendarRef.current?.getApi().next()}
                  className="btn-secondary px-3 py-2"
                  aria-label="Next calendar range"
                  title="Next calendar range"
                >
                  <ChevronRight size={16} />
                </button>

                <div className="ml-0 flex min-h-[46px] items-center rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.54)] px-4 text-sm font-semibold text-white/82 sm:ml-2">
                  {rangeLabel}
                </div>
              </div>

              <div className="flex flex-col gap-2 xl:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.46)] px-3 py-2 text-xs text-white/62">
                    {loading ? "Syncing calendar..." : `${filteredItems.length} event${filteredItems.length === 1 ? "" : "s"} in view`}
                  </div>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="btn-secondary px-4 py-2"
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshCcw size={16} />
                      Refresh
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyFeedLink();
                    }}
                    className="btn-secondary px-4 py-2"
                    disabled={copyingFeedLink}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Copy size={16} />
                      {copyingFeedLink ? "Copying..." : "Copy calendar feed link"}
                    </span>
                  </button>
                  {canCreate ? (
                    <button type="button" onClick={openCreateModal} className="btn-primary px-4 py-2">
                      <span className="inline-flex items-center gap-2">
                        <Plus size={16} />
                        New entry
                      </span>
                    </button>
                  ) : null}
                </div>
                <div className="max-w-xl text-xs leading-5 text-white/58 xl:text-right">
                  Use this private link to subscribe in Outlook, Google Calendar, or Apple Calendar. Keep it private.
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "all", label: "All visible", count: counts.all },
                  { value: "personal", label: "Personal", count: counts.personal },
                  { value: "course", label: "Course", count: counts.course },
                ] as const).map((filter) => {
                  const active = activeFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setActiveFilter(filter.value)}
                      className={[
                        "tab-pill inline-flex items-center gap-2",
                        active ? "tab-pill-active" : "tab-pill-idle",
                      ].join(" ")}
                    >
                      <span>{filter.label}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/72">
                        {filter.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                {VIEW_OPTIONS.map((view) => {
                  const active = currentView === view.value;
                  return (
                    <button
                      key={view.value}
                      type="button"
                      onClick={() => handleViewChange(view.value)}
                      className={[
                        "tab-pill",
                        active ? "tab-pill-active" : "tab-pill-idle",
                      ].join(" ")}
                    >
                      {view.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}
          {feedCopyMessage ? <div className="info-banner p-3 text-sm">{feedCopyMessage}</div> : null}
          {feedCopyWarning ? <div className="error-banner p-3 text-sm">{feedCopyWarning}</div> : null}
          {fallbackFeedUrl ? (
            <textarea
              className="min-h-[5rem] w-full resize-y rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.58)] p-3 text-xs text-white/78 outline-none"
              readOnly
              value={fallbackFeedUrl}
              aria-label="Private calendar feed link"
              onFocus={(event) => event.currentTarget.select()}
            />
          ) : null}

          <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="glass-panel-strong d6-calendar-shell min-h-[28rem] min-w-0 overflow-y-auto overflow-x-hidden p-2 sm:p-4 lg:max-h-[72dvh]">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                initialView={currentView}
                headerToolbar={false}
                height="auto"
                events={eventInputs}
                eventClick={handleEventClick}
                datesSet={(arg) => {
                  void handleDatesSet(arg);
                }}
                eventContent={renderCalendarEventContent}
                eventDisplay="block"
                dayMaxEventRows={4}
                fixedWeekCount={false}
                nowIndicator
                weekends
                stickyHeaderDates
                eventTimeFormat={{
                  hour: "2-digit",
                  minute: "2-digit",
                  meridiem: false,
                }}
                noEventsContent={() => "No visible events in this range."}
                moreLinkClassNames="d6-calendar-more-link"
              />
            </div>

            <div ref={detailPanelRef} className="space-y-4 xl:sticky xl:top-5 xl:self-start">
              <div className="glass-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
                      Focus panel
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      {focusedEntry ? focusedEntry.title : "Select an event"}
                    </h3>
                  </div>
                  {focusedEntry ? (
                    <span
                      className={[
                        "rounded-full border px-3 py-1 text-[11px] font-semibold",
                        getEntryPillClassName(focusedEntry),
                      ].join(" ")}
                    >
                      {getEntryLabel(focusedEntry)}
                    </span>
                  ) : null}
                </div>

                {!focusedEntry ? (
                  <div className="mt-4 rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.5)] p-4 text-sm text-white/72">
                    Click any event on the calendar to inspect the details here.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {focusedEntry.source === "COURSE_ENTRY" && getCourseLabel(focusedEntry) ? (
                        <span className="rounded-full border border-[rgba(52,211,153,0.24)] bg-[rgba(52,211,153,0.12)] px-3 py-1 text-[11px] font-semibold text-[#ddfff5]">
                          {getCourseLabel(focusedEntry)}
                        </span>
                      ) : null}
                      {focusedEntry.source === "CHANNEL_EVENT" ? (
                        <span className="rounded-full border border-[rgba(79,166,255,0.24)] bg-[rgba(79,166,255,0.14)] px-3 py-1 text-[11px] font-semibold text-[#d9eeff]">
                          Read-only from shared event feed
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-3 text-sm text-white/74">
                      <div className="flex items-start gap-3 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.46)] p-3">
                        <Clock3 size={16} className="mt-0.5 shrink-0 text-[#8CEBFF]" />
                        <div>{formatEventRange(focusedEntry.startsAt, focusedEntry.endsAt)}</div>
                      </div>

                      {focusedEntry.location ? (
                        <div className="flex items-start gap-3 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.46)] p-3">
                          <MapPin size={16} className="mt-0.5 shrink-0 text-[#8CEBFF]" />
                          <div>{focusedEntry.location}</div>
                        </div>
                      ) : null}

                      <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.46)] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
                          Description
                        </div>
                        <div className="mt-2 whitespace-pre-wrap leading-6 text-white/78">
                          {focusedEntry.description?.trim() || "No additional details were provided for this event."}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canManageFocusedEntry ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(focusedEntry)}
                            className="btn-secondary px-4 py-2"
                          >
                            <span className="inline-flex items-center gap-2">
                              <PencilLine size={16} />
                              Edit
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDelete(focusedEntry);
                            }}
                            className="btn-danger px-4 py-2"
                            disabled={deletingEntry}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Trash2 size={16} />
                              {deletingEntry ? "Deleting..." : "Delete"}
                            </span>
                          </button>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.5)] p-3 text-sm text-white/68">
                          {focusedEntry.source === "CHANNEL_EVENT"
                            ? "Channel events remain read-only from the calendar tab so existing announcement/channel workflows stay untouched."
                            : "This event is visible to you, but current backend rules do not allow you to manage it from here."}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="glass-panel p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Layers3 size={16} className="text-[#8CEBFF]" />
                  Visibility legend
                </div>

                <div className="mt-4 space-y-3 text-sm text-white/72">
                  <div className="flex items-start gap-3 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.46)] p-3">
                    <UserRound size={16} className="mt-0.5 shrink-0 text-[#8CEBFF]" />
                    <div>
                      <div className="font-semibold text-white">Personal</div>
                      <div>Your own calendar entries.</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-[rgba(52,211,153,0.18)] bg-[rgba(52,211,153,0.08)] p-3">
                    <BookOpen size={16} className="mt-0.5 shrink-0 text-[#7ef2cb]" />
                    <div>
                      <div className="font-semibold text-white">Course linked</div>
                      <div>Only appears when existing course assignment rules already allow it.</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-[rgba(79,166,255,0.18)] bg-[rgba(79,166,255,0.08)] p-3">
                    <BellRing size={16} className="mt-0.5 shrink-0 text-[#8abfff]" />
                    <div>
                      <div className="font-semibold text-white">Shared feed</div>
                      <div>Existing channel events that are already visible to your role.</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.46)] p-4 text-sm leading-6 text-white/70">
                  {getRoleNote(role)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CalendarEntryEditorModal
        key={editorState ? `${editorState.mode}-${editorState.entry?.id ?? "new"}` : "closed"}
        open={Boolean(editorState)}
        mode={editorState?.mode ?? "create"}
        entry={editorState?.entry ?? null}
        courseOptions={courseOptions}
        canAssignCourse={canAssignCourse}
        submitting={savingEntry}
        error={editorState ? error : null}
        onClose={() => setEditorState(null)}
        onSubmit={handleEditorSubmit}
      />
    </>
  );
}
