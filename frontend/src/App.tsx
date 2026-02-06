import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/Login-Page2";
import AppShell from "./components/AppShell";
import RequireDevBypass from "./components/RequireDevBypass";

import AppHome from "./pages/AppHome";
import Modules from "./pages/Modules";
import Faculty from "./pages/Faculty";
import Clubs from "./pages/Clubs";
import Emergency from "./pages/Emergency";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected */}
        <Route element={<RequireDevBypass />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<AppHome />} />
            <Route path="modules" element={<Modules />} />
            <Route path="faculty" element={<Faculty />} />
            <Route path="clubs" element={<Clubs />} />
            <Route path="emergency" element={<Emergency />} />
          </Route>
        </Route>

        <Route path="*" element={<div className="p-6 text-white">Not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
