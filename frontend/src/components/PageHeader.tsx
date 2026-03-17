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
    return "text-[#FF8CCF]";
  }

  if (tone === "general") {
    return "text-[#8CEBFF]";
  }

  return "bg-gradient-to-r from-[#8CEBFF] via-[#8C5BFF] to-[#FF5EDB] bg-clip-text text-transparent";
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

        {subtitle && <p className="mt-1 text-sm text-white/72">{subtitle}</p>}
      </div>

      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}