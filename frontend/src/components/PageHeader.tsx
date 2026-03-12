// src/components/PageHeader.tsx
// Shared page header used across the app.
// Responsibilities:
// - Render page title and optional subtitle
// - Render optional action buttons on the right
// - Support themed heading colors so section titles can match card colors

import type { ReactNode } from "react";

type HeaderTone =
  | "default"
  | "modules"
  | "faculty"
  | "clubs"
  | "emergency"
  | "general";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tone?: HeaderTone;
};

/**
 * Return heading text color classes based on the active section.
 * This lets page headings visually match the section’s announcement cards.
 */
function headingToneClass(tone: HeaderTone): string {
  if (tone === "modules") return "text-[#49BCF3]";
  if (tone === "faculty") return "text-[#70ECE4]";
  if (tone === "clubs") return "text-[#6C44FD]";
  if (tone === "emergency") return "text-[#DC2626]";
  if (tone === "general") return "text-[#4EC2F3]";
  return "text-slate-900";
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  tone = "default",
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1
          className={[
            "text-2xl font-bold tracking-tight",
            headingToneClass(tone),
          ].join(" ")}
        >
          {title}
        </h1>

        {subtitle && <p className="mt-1 text-sm text-black">{subtitle}</p>}
      </div>

      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}