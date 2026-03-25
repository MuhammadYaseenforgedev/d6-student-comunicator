// src/components/AppLayout.tsx
// Global app frame: background image + overlay + footer.
// Wraps ALL routes including login/register so the app feels consistent and enterprise.

import { Outlet } from "react-router-dom";
import AppFooter from "./AppFooter";
import bg from "../assets/forge-bg.png";

export default function AppLayout() {
  return (
    <div className="app-bg relative overflow-hidden">
      {/* Background image */}
      <div className="pointer-events-none absolute inset-0">
        <img
          src={bg}
          alt="Forge background"
          className="animated-bg h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[#020C2A]/82" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#081A44]/88 via-[#020C2A]/80 to-[#020C2A]/92" />

        {/* Halos */}
        <div className="absolute -top-28 -left-20 h-[28rem] w-[28rem] rounded-full bg-[#8CEBFF]/12 blur-3xl" />
        <div className="absolute top-10 right-[-6rem] h-[32rem] w-[32rem] rounded-full bg-[#8C5BFF]/14 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-[24rem] w-[24rem] rounded-full bg-[#2F7BFF]/10 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-20 h-[18rem] w-[18rem] rounded-full bg-[#FF5EDB]/8 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1">
        <Outlet />
      </div>

      {/* Footer */}
      <div className="relative z-20">
        <AppFooter />
      </div>
    </div>
  );
}