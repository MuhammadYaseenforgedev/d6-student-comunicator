export default function AnnouncementSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 rounded-full bg-slate-800/80" />
        <div className="h-5 w-16 rounded-full bg-slate-800/60" />
      </div>

      <div className="mt-4 h-6 w-2/3 rounded bg-slate-800/80" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-full rounded bg-slate-800/60" />
        <div className="h-4 w-5/6 rounded bg-slate-800/60" />
      </div>

      <div className="mt-4 h-3 w-40 rounded bg-slate-800/50" />
    </div>
  );
}
