// src/App.tsx
// Global router and application layout.
// Responsibilities:
// - Apply the global neon glass background
// - Render all routes
// - Keep footer visible on all pages
// - Provide a dark futuristic visual base

import { Suspense, lazy, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import AppFooter from "./components/AppFooter";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";
import RequireStudentProfileCompletion from "./components/RequireStudentProfileCompletion";

import { getUser } from "./lib/auth";
import { isFinanceAdmin } from "./lib/adminAccess";
import forgeBg from "./assets/forge-bg.png";
import LegalModal from "./components/LegalModal";
import AnimatedCursor from "./components/AnimatedCursor";

const LoginPage = lazy(() => import("./pages/Login-Page2"));
const AppHome = lazy(() => import("./pages/AppHome"));
const Courses = lazy(() => import("./pages/Courses"));
const Modules = lazy(() => import("./pages/Modules"));
const Faculty = lazy(() => import("./pages/Faculty"));
const Clubs = lazy(() => import("./pages/Clubs"));
const Emergency = lazy(() => import("./pages/Emergency"));
const ChannelPage = lazy(() => import("./pages/ChannelPage"));
const Inbox = lazy(() => import("./pages/Inbox"));
const ThreadPage = lazy(() => import("./pages/ThreadPage"));
const Uploads = lazy(() => import("./pages/Uploads1"));
const Calendar = lazy(() => import("./pages/Calendar"));
const ManageResults = lazy(() => import("./pages/ManageResults"));
const StudentResults = lazy(() => import("./pages/StudentResults"));
const AdminParentLinks = lazy(() => import("./pages/AdminParentLinks"));
const AdminFinance = lazy(() => import("./pages/AdminFinance"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const LearnerOnboarding = lazy(() => import("./pages/LearnerOnboarding"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Notifications = lazy(() => import("./pages/Notifications"));
const SupportDesk = lazy(() => import("./pages/SupportDesk"));
const ParentPortalLayout = lazy(() => import("./pages/parent/ParentPortalLayout"));
const ParentOverview = lazy(() => import("./pages/parent/ParentOverview"));
const ParentFinance = lazy(() => import("./pages/parent/ParentFinance"));
const ParentResults = lazy(() => import("./pages/parent/ParentResults"));
const ParentCalendar = lazy(() => import("./pages/parent/ParentCalendar"));
const ParentLinks = lazy(() => import("./pages/parent/ParentLinks"));
const ParentAttendance = lazy(() => import("./pages/parent/ParentAttendance"));
const StudentPersonalDetails = lazy(() => import("./pages/StudentPersonalDetails"));

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6 py-12 text-sm text-white/80">
      Loading...
    </div>
  );
}

function renderLazyRoute(node: ReactNode) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {node}
    </Suspense>
  );
}

function AppIndex() {
  const user = getUser();
  if (user?.role === "PARENT") return <Navigate to="/app/parent" replace />;
  if (isFinanceAdmin(user)) return <Navigate to="/app/admin/finance" replace />;
  return renderLazyRoute(<AppHome />);
}

export default function App() {
  const [legalOpen, setLegalOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="app-root-shell relative min-h-screen text-white">
        <AnimatedCursor />

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
          <div className="min-h-0 flex-1 overflow-visible lg:overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route
                path="/login"
                element={renderLazyRoute(<LoginPage onOpenLegal={() => setLegalOpen(true)} />)}
              />
              <Route path="/support" element={renderLazyRoute(<SupportDesk />)} />

              <Route element={<RequireAuth />}>
                <Route path="/app" element={<AppShell />}>
                  <Route
                    element={
                      <RequireRole roles={["STUDENT"]} />
                    }
                  >
                    <Route
                      path="personal-details"
                      element={renderLazyRoute(<StudentPersonalDetails />)}
                    />
                  </Route>

                  <Route element={<RequireStudentProfileCompletion />}>
                    <Route index element={<AppIndex />} />

                    <Route
                      element={
                        <RequireRole
                          roles={["STUDENT", "ADMIN"]}
                          adminScopes={["ACADEMIC", "SUPER"]}
                        />
                      }
                      >
                      <Route path="modules" element={renderLazyRoute(<Modules />)} />
                      <Route path="courses" element={renderLazyRoute(<Courses />)} />
                      <Route path="faculty" element={renderLazyRoute(<Faculty />)} />
                      <Route path="clubs" element={renderLazyRoute(<Clubs />)} />
                      <Route path="emergency" element={renderLazyRoute(<Emergency />)} />
                      <Route path="c/:id" element={renderLazyRoute(<ChannelPage />)} />
                      <Route path="attendance" element={renderLazyRoute(<Attendance />)} />
                    </Route>

                    <Route element={<RequireRole roles={["STUDENT"]} />}>
                      <Route path="results" element={renderLazyRoute(<StudentResults />)} />
                    </Route>

                    <Route
                      element={
                        <RequireRole roles={["STUDENT", "ADMIN", "PARENT"]} />
                      }
                    >
                      <Route path="messages" element={renderLazyRoute(<Inbox />)} />
                      <Route path="messages/:id" element={renderLazyRoute(<ThreadPage />)} />
                    </Route>

                    <Route
                      element={
                        <RequireRole
                          roles={["STUDENT", "ADMIN", "PARENT"]}
                          adminScopes={["ACADEMIC", "SUPER"]}
                        />
                      }
                    >
                      <Route
                        path="notifications"
                        element={renderLazyRoute(<Notifications />)}
                      />
                    </Route>

                    <Route
                      element={
                        <RequireRole
                          roles={["STUDENT", "ADMIN", "PARENT"]}
                          adminScopes={["ACADEMIC", "SUPER"]}
                        />
                      }
                    >
                      <Route path="uploads" element={renderLazyRoute(<Uploads />)} />
                    </Route>

                    <Route
                      element={
                        <RequireRole
                          roles={["STUDENT", "ADMIN"]}
                          adminScopes={["ACADEMIC", "SUPER"]}
                        />
                      }
                    >
                      <Route path="calendar" element={renderLazyRoute(<Calendar />)} />
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
                        path="manage-results"
                        element={renderLazyRoute(<ManageResults />)}
                      />
                    </Route>

                    <Route
                      element={
                        <RequireRole roles={["ADMIN"]} adminScopes={["FINANCE"]} />
                      }
                    >
                      <Route
                        path="admin/finance"
                        element={renderLazyRoute(<AdminFinance />)}
                      />
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
                        element={renderLazyRoute(<AdminParentLinks />)}
                      />
                      <Route
                        path="admin/learner-onboarding"
                        element={renderLazyRoute(<LearnerOnboarding />)}
                      />
                    </Route>

                    <Route
                      element={
                        <RequireRole
                          roles={["ADMIN"]}
                          adminScopes={["ACADEMIC", "SUPER"]}
                        />
                      }
                    >
                      <Route path="admin/users" element={renderLazyRoute(<AdminUsers />)} />
                    </Route>

                    <Route element={<RequireRole roles={["PARENT"]} />}>
                      <Route path="parent" element={renderLazyRoute(<ParentPortalLayout />)}>
                        <Route index element={renderLazyRoute(<ParentOverview />)} />
                        <Route path="finance" element={renderLazyRoute(<ParentFinance />)} />
                        <Route path="results" element={renderLazyRoute(<ParentResults />)} />
                        <Route path="calendar" element={renderLazyRoute(<ParentCalendar />)} />
                        <Route path="children" element={renderLazyRoute(<ParentLinks />)} />
                        <Route
                          path="attendance"
                          element={renderLazyRoute(<ParentAttendance />)}
                        />
                      </Route>
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
            <AppFooter onOpenLegal={() => setLegalOpen(true)} />
          </div>
        </div>

        <LegalModal open={legalOpen} onClose={() => setLegalOpen(false)} />
      </div>
    </BrowserRouter>
  );
}
