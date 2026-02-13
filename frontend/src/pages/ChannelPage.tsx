import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import NewAnnouncementModal from "../components/NewAnnouncementModal";
import AnnouncementCard from "../components/AnnouncementCard";
import type { ChannelKey } from "../lib/types";
import { useAnnouncements } from "../hooks/useAnnouncements";
import PageHeader from "../components/PageHeader";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import AnnouncementSkeleton from "../components/AnnouncementSkeleton";

type ChannelPageProps = {
  channel?: ChannelKey; // if provided, this page is "static" (Home/Modules/etc)
  title?: string;
  subtitle?: string;
};

function asChannelKey(id?: string): ChannelKey {
  if (id === "modules") return "modules";
  if (id === "faculty") return "faculty";
  if (id === "clubs") return "clubs";
  if (id === "emergency") return "emergency";
  return "general";
}

export default function ChannelPage(props: ChannelPageProps) {
  const params = useParams<{ id: string }>();

  const resolvedChannel: ChannelKey = useMemo(() => {
    if (props.channel) return props.channel;
    return asChannelKey(params.id);
  }, [props.channel, params.id]);

  const resolvedTitle = useMemo(() => {
    if (props.title) return props.title;
    if (params.id) return `Channel: ${params.id}`;
    return "Channel";
  }, [props.title, params.id]);

  const resolvedSubtitle = useMemo(() => {
    if (props.subtitle) return props.subtitle;
    return `Showing announcements for ${resolvedChannel}.`;
  }, [props.subtitle, resolvedChannel]);

  const { items, loading, error, clearError, create, resetDemo, mode } =
    useAnnouncements(resolvedChannel);

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
        title={resolvedTitle}
        subtitle={`${resolvedSubtitle} (${mode})`}
        actions={actions}
      />

      {error && <ErrorBanner message={error} onDismiss={clearError} />}

      <div className="mt-6 space-y-4">
        {loading ? (
          <>
            <AnnouncementSkeleton />
            <AnnouncementSkeleton />
            <AnnouncementSkeleton />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            subtitle="Create the first announcement for this channel."
            action={
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700"
              >
                Create announcement
              </button>
            }
          />
        ) : (
          items.map((a) => <AnnouncementCard key={a.id} a={a} />)
        )}
      </div>

      {/* ✅ KEY REMOUNT PATTERN (fixes state reset warnings cleanly) */}
      <NewAnnouncementModal
        key={`${resolvedChannel}-${open ? "open" : "closed"}`}
        open={open}
        onClose={() => setOpen(false)}
        defaultChannel={resolvedChannel}
        onCreate={create}
      />
    </div>
  );
}
