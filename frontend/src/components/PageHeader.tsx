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

function headingToneClass(tone: HeaderTone): string {
  if (tone === "modules") {
    return "text-[#38D5FF]";
  }

  if (tone === "faculty") {
    return "text-[#35FFE3]";
  }

  if (tone === "clubs") {
    return "text-[#8C5BFF]";
  }

  if (tone === "emergency") {
    return "text-[#FF3B3B]";
  }

  if (tone === "general") {
    return "page-heading-gradient";
  }

  return "page-heading-gradient";
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  tone = "default",
}: Props) {
  return (
    <div className="page-header-shell flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="page-header-copy min-w-0">
        <h1
          className={[
            "page-header-title text-[1.75rem] font-bold tracking-tight sm:text-2xl",
            headingToneClass(tone),
          ].join(" ")}
        >
          {title}
        </h1>

        {subtitle && (
          <p className="page-header-subtitle mt-1 text-sm text-white/72">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="page-header-actions flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
