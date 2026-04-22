// src/components/ErrorBanner.tsx
// Shared dismissible error banner.
// Responsibilities:
// - Show a friendly error heading
// - Display the provided error message
// - Allow optional dismiss action

type Props = {
  message: string;
  onDismiss?: () => void;
};

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="error-banner mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm leading-relaxed">
          <div className="font-semibold">Something went wrong</div>
          <div className="mt-1 text-red-100/90">{message}</div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="btn-danger px-3 py-1 text-xs"
            title="Dismiss error message"
            aria-label="Dismiss error message"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}