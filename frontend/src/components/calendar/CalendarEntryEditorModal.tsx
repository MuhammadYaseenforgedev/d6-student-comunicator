import { useState } from "react";
import { CalendarPlus, PencilLine, Save, X } from "lucide-react";
import type { CalendarEntry } from "../../api/calendar";
import { toLocalInputValue } from "../../hooks/useCalendarApi";
import type { CourseRecord } from "../../lib/courseApi";

export type CalendarEntryEditorValues = {
  title: string;
  startsLocal: string;
  endsLocal: string;
  location: string;
  description: string;
  courseId: string;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  entry?: CalendarEntry | null;
  courseOptions: CourseRecord[];
  canAssignCourse: boolean;
  submitting: boolean;
  error?: string | null;
  initialStart?: string | null;
  initialEnd?: string | null;
  onClose: () => void;
  onSubmit: (values: CalendarEntryEditorValues) => Promise<void> | void;
};

function getDefaultRange() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startsLocal: toLocalInputValue(start.toISOString()),
    endsLocal: toLocalInputValue(end.toISOString()),
  };
}

function buildInitialValues(
  entry: CalendarEntry | null | undefined,
  initialStart?: string | null,
  initialEnd?: string | null
): CalendarEntryEditorValues {
  if (entry) {
    return {
      title: entry.title,
      startsLocal: toLocalInputValue(entry.startsAt),
      endsLocal: toLocalInputValue(entry.endsAt),
      location: entry.location ?? "",
      description: entry.description ?? "",
      courseId: entry.courseId ?? "",
    };
  }

  const defaults = getDefaultRange();
  return {
    title: "",
    startsLocal: initialStart ? toLocalInputValue(initialStart) : defaults.startsLocal,
    endsLocal: initialEnd ? toLocalInputValue(initialEnd) : defaults.endsLocal,
    location: "",
    description: "",
    courseId: "",
  };
}

export default function CalendarEntryEditorModal({
  open,
  mode,
  entry,
  courseOptions,
  canAssignCourse,
  submitting,
  error,
  initialStart,
  initialEnd,
  onClose,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<CalendarEntryEditorValues>(() =>
    buildInitialValues(entry, initialStart, initialEnd)
  );

  const titleOk = values.title.trim().length > 0;
  const timeOk =
    values.startsLocal.trim().length > 0 &&
    values.endsLocal.trim().length > 0 &&
    new Date(values.endsLocal).getTime() > new Date(values.startsLocal).getTime();
  const canSubmit = titleOk && timeOk && !submitting;

  const heading = mode === "create" ? "Create calendar entry" : "Edit calendar entry";

  if (!open) return null;

  function updateField<K extends keyof CalendarEntryEditorValues>(
    key: K,
    nextValue: CalendarEntryEditorValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: nextValue }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit(values);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020C2A]/78 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="glass-panel-strong w-full max-w-2xl p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.58)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              {mode === "create" ? <CalendarPlus size={14} /> : <PencilLine size={14} />}
              {mode === "create" ? "New entry" : "Update entry"}
            </div>
            <h2 className="text-xl font-semibold text-white">{heading}</h2>
            <p className="text-sm text-white/68">
              Keep planning inside D6 with the same role and course rules already enforced by the backend.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-3 py-2"
            disabled={submitting}
            aria-label="Close calendar editor"
            title="Close calendar editor"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="calendar-entry-title" className="text-sm text-white/78">
              Title
            </label>
            <input
              id="calendar-entry-title"
              value={values.title}
              onChange={(event) => updateField("title", event.target.value)}
              className="input-glass mt-1"
              placeholder="Strategy review session"
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="calendar-entry-start" className="text-sm text-white/78">
                Start
              </label>
              <input
                id="calendar-entry-start"
                type="datetime-local"
                value={values.startsLocal}
                onChange={(event) => updateField("startsLocal", event.target.value)}
                className="input-glass mt-1"
              />
            </div>

            <div>
              <label htmlFor="calendar-entry-end" className="text-sm text-white/78">
                End
              </label>
              <input
                id="calendar-entry-end"
                type="datetime-local"
                value={values.endsLocal}
                onChange={(event) => updateField("endsLocal", event.target.value)}
                className="input-glass mt-1"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="calendar-entry-location" className="text-sm text-white/78">
                Location
              </label>
              <input
                id="calendar-entry-location"
                value={values.location}
                onChange={(event) => updateField("location", event.target.value)}
                className="input-glass mt-1"
                placeholder="Forge Campus or Microsoft Teams"
              />
            </div>

            {canAssignCourse ? (
              <div>
                <label htmlFor="calendar-entry-course" className="text-sm text-white/78">
                  Course visibility
                </label>
                <select
                  id="calendar-entry-course"
                  value={values.courseId}
                  onChange={(event) => updateField("courseId", event.target.value)}
                  className="select-glass mt-1"
                >
                  <option value="">Personal entry only</option>
                  {courseOptions.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.54)] px-4 py-3 text-sm text-white/70">
                This entry will stay personal to your calendar.
              </div>
            )}
          </div>

          <div>
            <label htmlFor="calendar-entry-description" className="text-sm text-white/78">
              Description
            </label>
            <textarea
              id="calendar-entry-description"
              rows={5}
              value={values.description}
              onChange={(event) => updateField("description", event.target.value)}
              className="input-glass mt-1 min-h-[140px]"
              placeholder="Add the context, agenda, or preparation notes."
            />
          </div>

          {!timeOk && (
            <div className="rounded-2xl border border-[rgba(255,196,87,0.22)] bg-[rgba(97,59,9,0.35)] px-4 py-3 text-sm text-[#ffe8b0]">
              End time must be after the selected start time.
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary min-w-[160px]" disabled={!canSubmit}>
              <span className="inline-flex items-center gap-2">
                <Save size={16} />
                {submitting ? "Saving..." : mode === "create" ? "Create entry" : "Save changes"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
