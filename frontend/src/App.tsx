// src/App.tsx
// Global router and application layout.
// Responsibilities:
// - Apply the global neon glass background
// - Render all routes
// - Keep footer visible on all pages
// - Provide a dark futuristic visual base

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/Login-Page2";
import AppShell from "./components/AppShell";
import AppFooter from "./components/AppFooter";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import DevRoleSwitcher from "./components/DevRoleSwitcher";

import AppHome from "./pages/AppHome";
import Courses from "./pages/Courses";
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
import StudentResults from "./pages/StudentResults";
import AdminParentLinks from "./pages/AdminParentLinks";
import AdminFinance from "./pages/AdminFinance";
import AdminUsers from "./pages/AdminUsers";
import Attendance from "./pages/Attendance";
import Notifications from "./pages/Notifications";
import AdminTickets from "./pages/AdminTickets";
import SupportDesk from "./pages/SupportDesk";

import ParentPortalLayout from "./pages/parent/ParentPortalLayout";
import ParentOverview from "./pages/parent/ParentOverview";
import ParentFinance from "./pages/parent/ParentFinance";
import ParentResults from "./pages/parent/ParentResults";
import ParentCalendar from "./pages/parent/ParentCalendar";
import ParentLinks from "./pages/parent/ParentLinks";
import ParentAttendance from "./pages/parent/ParentAttendance";

import { getUser } from "./lib/auth";
import { isFinanceAdmin } from "./lib/adminAccess";
import forgeBg from "./assets/forge-bg.png";

function AppIndex() {
  const user = getUser();
  if (user?.role === "PARENT") return <Navigate to="/app/parent" replace />;
  if (isFinanceAdmin(user)) return <Navigate to="/app/admin/finance" replace />;
  return <AppHome />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-root-shell relative min-h-screen text-white">
        {/* GLOBAL FIXED BACKGROUND */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <img
            src={forgeBg}
            alt="Forge neon background"
            className="animated-bg absolute inset-0 h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-[#020C2A]/82" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#081A44]/88 via-[#020C2A]/80 to-[#020C2A]/92" />

          <div className="absolute -left-20 -top-28 h-[28rem] w-[28rem] rounded-full bg-[#8CEBFF]/12 blur-3xl" />
          <div className="absolute right-[-6rem] top-10 h-[32rem] w-[32rem] rounded-full bg-[#8C5BFF]/14 blur-3xl" />
          <div className="absolute bottom-[-8rem] left-1/3 h-[24rem] w-[24rem] rounded-full bg-[#2F7BFF]/10 blur-3xl" />
          <div className="absolute bottom-[-6rem] right-20 h-[18rem] w-[18rem] rounded-full bg-[#FF5EDB]/8 blur-3xl" />
        </div>

        {/* ROUTES */}
        <div className="relative z-10 flex min-h-screen flex-col">
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/support" element={<SupportDesk />} />

              <Route element={<RequireAuth />}>
                <Route path="/app" element={<AppShell />}>
                  <Route index element={<AppIndex />} />

                  <Route
                    element={
                      <RequireRole
                        roles={["STUDENT", "LECTURER", "ADMIN"]}
                        adminScopes={["ACADEMIC", "SUPER"]}
                      />
                    }
                  >
                    <Route path="modules" element={<Modules />} />
                    <Route path="courses" element={<Courses />} />
                    <Route path="faculty" element={<Faculty />} />
                    <Route path="clubs" element={<Clubs />} />
                    <Route path="emergency" element={<Emergency />} />
                    <Route path="c/:id" element={<ChannelPage />} />
                    <Route path="attendance" element={<Attendance />} />
                  </Route>

                  <Route element={<RequireRole roles={["STUDENT"]} />}>
                    <Route path="results" element={<StudentResults />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole roles={["STUDENT", "LECTURER", "ADMIN", "PARENT"]} />
                    }
                  >
                    <Route path="messages" element={<Inbox />} />
                    <Route path="messages/:id" element={<ThreadPage />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole
                        roles={["STUDENT", "LECTURER", "ADMIN", "PARENT"]}
                        adminScopes={["ACADEMIC", "SUPER"]}
                      />
                    }
                  >
                    <Route path="notifications" element={<Notifications />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole
                        roles={["STUDENT", "LECTURER", "ADMIN", "PARENT"]}
                        adminScopes={["ACADEMIC", "SUPER"]}
                      />
                    }
                  >
                    <Route path="uploads" element={<Uploads />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole
                        roles={["STUDENT", "LECTURER", "ADMIN"]}
                        adminScopes={["ACADEMIC", "SUPER"]}
                      />
                    }
                  >
                    <Route path="calendar" element={<Calendar />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole
                        roles={["ADMIN", "LECTURER"]}
                        adminScopes={["ACADEMIC", "SUPER"]}
                      />
                    }
                  >
                    <Route path="manage-results" element={<ManageResults />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole roles={["ADMIN"]} adminScopes={["FINANCE"]} />
                    }
                  >
                    <Route path="admin/finance" element={<AdminFinance />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole
                        roles={["ADMIN"]}
                        adminScopes={["ACADEMIC", "SUPER"]}
                      />
                    }
                  >
                    <Route
                      path="admin/parent-links"
                      element={<AdminParentLinks />}
                    />
                    <Route path="admin/users" element={<AdminUsers />} />
                  </Route>

                  <Route
                    element={
                      <RequireRole roles={["ADMIN"]} adminScopes={["SUPER"]} />
                    }
                  >
                    <Route path="admin/tickets" element={<AdminTickets />} />
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
                element={<div className="p-6 text-white">Not found</div>}
              />
            </Routes>
          </div>

          {/* FOOTER */}
          <div className="relative z-20 mt-3 lg:mt-4 pb-4 lg:pb-6">
            <AppFooter />
          </div>
        </div>

        <DevRoleSwitcher />
      </div>
    </BrowserRouter>
  );
}