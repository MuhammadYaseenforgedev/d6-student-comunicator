import { ExternalLink } from "lucide-react";

export default function LmsAccessButton({
  href,
  label = "Open Course in LMS",
}: {
  href?: string | null;
  label?: string;
}) {
  if (!href?.trim()) {
    return (
      <button
        type="button"
        disabled
        className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs opacity-60"
        title="LMS link unavailable"
        aria-label="LMS link unavailable"
      >
        <ExternalLink size={14} />
        LMS unavailable
      </button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"
      title="Open external LMS course"
      aria-label="Open external LMS course"
    >
      <ExternalLink size={14} />
      {label}
    </a>
  );
}
