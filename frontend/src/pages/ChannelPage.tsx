import { useMemo, useState } from "react";
import type { ChannelKey } from "../lib/types";
import { addAnnouncement, getAnnouncements, resetAnnouncementsDemo } from "../lib/announcementStore";
import AnnouncementCard from "../components/AnnouncementCard";
import NewAnnouncementModal from "../components/NewAnnouncementModal";

type Props = {
  channel: ChannelKey;
  title: string;
  subtitle: string;
};

export default function ChannelPage({ channel, title, subtitle }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const all = useMemo(() => getAnnouncements(), [tick]);

  const items = useMemo(() => {
    return all
      .filter((a) => a.channel === channel)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [all, channel]);

  function onResetDemo() {
    resetAnnouncementsDemo();
    setTick((t) => t + 1);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-slate-400">{subtitle}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onResetDemo}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
          >
            Reset demo
          </button>
          <button
            onClick={() => setIsOpen(true)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700"
          >
            New announcement
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
            No announcements yet for <span className="text-white">{title}</span>.
          </div>
        ) : (
          items.map((a) => <AnnouncementCard key={a.id} a={a} />)
        )}
      </div>

      <NewAnnouncementModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        initialChannel={channel}
        onCreate={(payload) => {
          addAnnouncement(payload);
          setTick((t) => t + 1);
        }}
      />
    </div>
  );
}
