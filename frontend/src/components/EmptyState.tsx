type Props = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export default function EmptyState({ title, subtitle, action }: Props) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/30 p-6">
      <div className="flex items-start gap-4">
        <div className="mt-1 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="h-5 w-5 rounded bg-slate-700/60" />
        </div>

        <div className="flex-1">
          <div className="text-base font-semibold text-white">{title}</div>
          {subtitle && <div className="mt-1 text-sm text-slate-400">{subtitle}</div>}

          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}
