type Props = {
  message: string;
  onDismiss?: () => void;
};

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-red-100">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm leading-relaxed">
          <div className="font-semibold">Something went wrong</div>
          <div className="mt-1 text-red-100/90">{message}</div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-1 text-xs hover:bg-red-950/50"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
