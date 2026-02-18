// src/App.tsx
// Global router + global enterprise layout.
// - Forge background image on ALL pages (login + protected routes)
// - Footer visible on ALL pages
// - Footer is proportional (app-like, not a huge website banner)

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/Login-Page2";
import AppShell from "./components/AppShell";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";

import AppHome from "./pages/AppHome";
import Modules from "./pages/Modules";
import Faculty from "./pages/Faculty";
import Clubs from "./pages/Clubs";
import Emergency from "./pages/Emergency";
import ChannelPage from "./pages/ChannelPage";

import Inbox from "./pages/Inbox";
import ThreadPage from "./pages/ThreadPage";
import Uploads from "./pages/Uploads1";
import Calendar from "./pages/Calendar"; // ✅ was Calendar1

import ParentPortalLayout from "./pages/parent/ParentPortalLayout";
import ParentOverview from "./pages/parent/ParentOverview";
import ParentFinance from "./pages/parent/ParentFinance";
import ParentResults from "./pages/parent/ParentResults";
import ParentCalendar from "./pages/parent/ParentCalendar";
import ParentLinks from "./pages/parent/ParentLinks";

// Images (ensure these exist in src/assets)
import forgeFooter from "./assets/forge-footer.jpg";
import forgeBg from "./assets/forge-bg.png";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col text-white relative">
        {/* Global background image */}
        <div className="pointer-events-none absolute inset-0">
          <img
            src={forgeBg}
            alt="Forge background"
            className="h-full w-full object-cover"
          />
          {/* Darken and tint so content stays readable */}
          <div className="absolute inset-0 bg-slate-950/75" />
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-slate-950/40" />
        </div>

        {/* Main routed content */}
        <div className="relative flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<AppHome />} />
                <Route path="modules" element={<Modules />} />
                <Route path="faculty" element={<Faculty />} />
                <Route path="clubs" element={<Clubs />} />
                <Route path="emergency" element={<Emergency />} />
                <Route path="c/:id" element={<ChannelPage />} />

                <Route path="messages" element={<Inbox />} />
                <Route path="messages/:id" element={<ThreadPage />} />

                <Route path="uploads" element={<Uploads />} />
                <Route path="calendar" element={<Calendar />} />

                <Route element={<RequireRole roles={["PARENT"]} />}>
                  <Route path="parent" element={<ParentPortalLayout />}>
                    <Route index element={<ParentOverview />} />
                    <Route path="finance" element={<ParentFinance />} />
                    <Route path="results" element={<ParentResults />} />
                    <Route path="calendar" element={<ParentCalendar />} />
                    <Route path="children" element={<ParentLinks />} />
                  </Route>
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<div className="p-6">Not found</div>} />
          </Routes>
        </div>

        {/* Global footer (enterprise) */}
        <footer className="relative z-50 px-4 pb-4">
          <div className="mx-auto w-full max-w-7xl">
            <div className="relative h-[5cm] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
              {/* No cropping */}
              <img
                src={forgeFooter}
                alt="Forge Academy footer banner"
                className="h-full w-full object-contain"
                draggable={false}
              />

              {/* Blend into background (subtle fade + polish) */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/15 via-transparent to-slate-950/15" />
            </div>

            <div className="mt-3 text-center text-xs text-white/60">
              © {new Date().getFullYear()} Forge Academy. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
