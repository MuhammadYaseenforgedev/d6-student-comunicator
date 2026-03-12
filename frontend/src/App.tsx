// src/App.tsx
// Global router and application layout.
// Responsibilities:
// - Apply the global light background
// - Render all routes
// - Keep footer visible on all pages
// - Provide a clean, minimal, professional visual base

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/Login-Page2";
import AppShell from "./components/AppShell";
import AppFooter from "./components/AppFooter";
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
import Calendar from "./pages/Calendar";
import ManageResults from "./pages/ManageResults";
import AdminParentLinks from "./pages/AdminParentLinks";
import Attendance from "./pages/Attendance";

import ParentPortalLayout from "./pages/parent/ParentPortalLayout";
import ParentOverview from "./pages/parent/ParentOverview";
import ParentFinance from "./pages/parent/ParentFinance";
import ParentResults from "./pages/parent/ParentResults";
import ParentCalendar from "./pages/parent/ParentCalendar";
import ParentLinks from "./pages/parent/ParentLinks";
import ParentAttendance from "./pages/parent/ParentAttendance";

import { getUser } from "./lib/auth";

function AppIndex() {
  const user = getUser();
  if (user?.role === "PARENT") return <Navigate to="/app/parent" replace />;
  return <AppHome />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="relative flex min-h-screen flex-col overflow-hidden text-black">
        {/* Global light background */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#F2F3F5]" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#ffffff] via-[#F2F3F5] to-[#E5E7EB]" />
          <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[#4EC2F3]/10 blur-3xl" />
          <div className="absolute top-32 right-[-80px] h-96 w-96 rounded-full bg-[#794DFA]/8 blur-3xl" />
          <div className="absolute bottom-[-120px] left-1/3 h-80 w-80 rounded-full bg-[#7EF3E3]/10 blur-3xl" />
        </div>

        {/* Main routed content */}
        <div className="relative z-10 flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<AppIndex />} />

                <Route
                  element={
                    <RequireRole roles={["STUDENT", "LECTURER", "ADMIN"]} />
                  }
                >
                  <Route path="modules" element={<Modules />} />
                  <Route path="faculty" element={<Faculty />} />
                  <Route path="clubs" element={<Clubs />} />
                  <Route path="emergency" element={<Emergency />} />
                  <Route path="c/:id" element={<ChannelPage />} />
                  <Route path="attendance" element={<Attendance />} />
                </Route>

                <Route
                  element={
                    <RequireRole
                      roles={["STUDENT", "LECTURER", "ADMIN", "PARENT"]}
                    />
                  }
                >
                  <Route path="messages" element={<Inbox />} />
                  <Route path="messages/:id" element={<ThreadPage />} />
                </Route>

                <Route path="uploads" element={<Uploads />} />
                <Route path="calendar" element={<Calendar />} />

                <Route element={<RequireRole roles={["ADMIN", "LECTURER"]} />}>
                  <Route path="manage-results" element={<ManageResults />} />
                </Route>

                <Route element={<RequireRole roles={["ADMIN"]} />}>
                  <Route
                    path="admin/parent-links"
                    element={<AdminParentLinks />}
                  />
                </Route>

                <Route element={<RequireRole roles={["PARENT"]} />}>
                  <Route path="parent" element={<ParentPortalLayout />}>
                    <Route index element={<ParentOverview />} />
                    <Route path="finance" element={<ParentFinance />} />
                    <Route path="results" element={<ParentResults />} />
                    <Route path="calendar" element={<ParentCalendar />} />
                    <Route path="children" element={<ParentLinks />} />
                    <Route path="attendance" element={<ParentAttendance />} />
                  </Route>
                </Route>
              </Route>
            </Route>

            <Route
              path="*"
              element={<div className="p-6 text-black">Not found</div>}
            />
          </Routes>
        </div>

        {/* Global footer */}
        <div className="relative z-20 mt-10">
          <AppFooter />
        </div>
      </div>
    </BrowserRouter>
  );
}