// src/components/AnnouncementSkeleton.tsx
// Loading placeholder for announcement cards.
//
// Responsibilities:
// - Provide a visual placeholder while announcement data is loading
// - Match the size and rhythm of the real announcement cards
// - Keep styling aligned with the glass UI panels

export default function AnnouncementSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      {/* Badge placeholders */}
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 rounded-full bg-white/10" />
        <div className="h-5 w-16 rounded-full bg-white/8" />
      </div>

      {/* Title placeholder */}
      <div className="mt-4 h-6 w-2/3 rounded bg-white/10" />

      {/* Body placeholders */}
      <div className="mt-3 space-y-2">
        <div className="h-4 w-full rounded bg-white/8" />
        <div className="h-4 w-5/6 rounded bg-white/8" />
      </div>

      {/* Footer/meta placeholder */}
      <div className="mt-4 h-3 w-40 rounded bg-white/6" />
    </div>
  );
}