// src/components/EmptyState.tsx
// Generic empty state component.
// Responsibilities:
// - Show a title and optional subtitle
// - Optionally render an action button or control

type Props = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export default function EmptyState({ title, subtitle, action }: Props) {
  return (
    <div className="glass-panel mt-6 p-6">
      <div className="flex items-start gap-4">
        <div className="mt-1 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="h-5 w-5 rounded bg-white/20" />
        </div>

        <div className="flex-1">
          <div className="text-base font-semibold text-white">{title}</div>

          {subtitle && (
            <div className="mt-1 text-sm text-slate-400">{subtitle}</div>
          )}

          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}