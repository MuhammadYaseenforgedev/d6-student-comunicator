import type { ReactNode } from "react";
import React from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string };

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  componentDidCatch(error: unknown) {
    // Logs to console for debugging
    console.error("AppErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-6 text-red-100">
          <div className="text-lg font-semibold">Page crashed</div>
          <div className="mt-2 text-sm text-red-100/90">
            {this.state.message}
          </div>
          <div className="mt-4 text-xs text-red-200/70">
            Open the browser console to see the full stack trace.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
