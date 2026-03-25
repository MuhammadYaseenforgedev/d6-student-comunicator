// src/components/AnnouncementSkeleton.tsx
// Loading placeholder for announcement cards.
//
// Responsibilities:
// - Provide a visual placeholder while announcement data is loading
// - Match the size and rhythm of the real announcement cards
// - Keep styling aligned with the glass UI panels

export default function AnnouncementSkeleton() {
  return (
    <div className="rounded-3xl border border-[#2F7BFF]/25 bg-[#081A44]/60 p-5 shadow-[0_0_0_1px_rgba(79,166,255,0.10),0_10px_28px_rgba(2,12,42,0.50)] backdrop-blur-xl">
      {/* Badge placeholders */}
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 rounded-full bg-white/12" />
        <div className="h-5 w-16 rounded-full bg-white/10" />
      </div>

      {/* Title placeholder */}
      <div className="mt-4 h-6 w-2/3 rounded bg-white/12" />

      {/* Body placeholders */}
      <div className="mt-3 space-y-2">
        <div className="h-4 w-full rounded bg-white/10" />
        <div className="h-4 w-5/6 rounded bg-white/10" />
      </div>

      {/* Footer/meta placeholder */}
      <div className="mt-4 h-3 w-40 rounded bg-white/8" />
    </div>
  );
}