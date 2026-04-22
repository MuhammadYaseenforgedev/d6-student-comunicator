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
    console.error("AppErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-3xl border border-[#ff5edb]/25 bg-[rgba(74,10,31,0.72)] p-6 text-[#ffe1e8] shadow-[0_0_22px_rgba(255,94,219,0.10),0_16px_38px_rgba(3,10,28,0.35)] backdrop-blur-2xl">
          <div className="text-lg font-semibold text-white">Page crashed</div>
          <div className="mt-2 text-sm text-[#ffe1e8]/90">
            {this.state.message}
          </div>
          <div className="mt-4 text-xs text-[#ffd0df]/75">
            Open the browser console to see the full stack trace.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}