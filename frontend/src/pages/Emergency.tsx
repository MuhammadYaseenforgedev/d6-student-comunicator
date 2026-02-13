import { useState } from "react";
import NewAnnouncementModal from "../components/NewAnnouncementModal";
import AnnouncementCard from "../components/AnnouncementCard";
import { useAnnouncements } from "../hooks/useAnnouncements";
import PageHeader from "../components/PageHeader";

export default function Emergency() {
  const { items, loading, error, create, resetDemo, mode } =
    useAnnouncements("emergency");
  const [open, setOpen] = useState(false);

  const actions = (
    <>
      {mode === "mock" && (
        <button
          onClick={resetDemo}
          className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
          type="button"
        >
          Reset demo
        </button>
      )}
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700"
        type="button"
      >
        New announcement
      </button>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Emergency"
        subtitle={`High priority alerts show here. (${mode})`}
        actions={actions}
      />

      {loading && <div className="mt-6 text-slate-400">Loading…</div>}
      {error && <div className="mt-6 text-red-300">{error}</div>}

      <div className="mt-6 space-y-4">
        {!loading && items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
            No emergency announcements yet.
          </div>
        ) : (
          items.map((a) => <AnnouncementCard key={a.id} a={a} />)
        )}
      </div>

      <NewAnnouncementModal
        key={`emergency-${open ? "open" : "closed"}`}
        open={open}
        onClose={() => setOpen(false)}
        defaultChannel="emergency"
        onCreate={create}
      />
    </div>
  );
}
