// src/components/AppLayout.tsx
// Global app frame: background image + overlay + footer.
// Wraps ALL routes including login/register so the app feels consistent and enterprise.

import { Outlet } from "react-router-dom";
import AppFooter from "./AppFooter";
import bg from "../assets/forge-bg.png";

export default function AppLayout() {
  return (
    <div className="app-bg relative">
      {/* Background image */}
      <div className="pointer-events-none absolute inset-0">
        <img
          src={bg}
          alt="Forge background"
          className="h-full w-full object-cover"
        />
        {/* Darken + add brand tint so UI stays readable */}
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-slate-950/40" />
      </div>

      {/* Content */}
      <div className="relative flex-1">
        <Outlet />
      </div>

      {/* Footer */}
      <div className="relative">
        <AppFooter />
      </div>
    </div>
  );
}
