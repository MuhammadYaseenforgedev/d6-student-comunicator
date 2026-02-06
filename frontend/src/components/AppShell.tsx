import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { setDevBypass } from "../lib/auth";

function Item({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "block rounded-lg px-3 py-2 text-sm border transition",
          isActive
            ? "bg-slate-800/70 border-slate-700 text-white"
            : "bg-transparent border-transparent text-slate-300 hover:bg-slate-900/60 hover:border-slate-800 hover:text-white",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const title =
    location.pathname.includes("/modules")
      ? "Modules"
      : location.pathname.includes("/faculty")
      ? "Faculty"
      : location.pathname.includes("/clubs")
      ? "Clubs"
      : location.pathname.includes("/emergency")
      ? "Emergency"
      : "Home";

  function logoutDev() {
    setDevBypass(false);
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <Link to="/app" className="block">
              <div className="text-xl font-bold">D6 Communicator</div>
              <div className="text-xs text-slate-400 mt-1">Dev mode (login bypass)</div>
            </Link>

            <div className="mt-6 space-y-1">
              <Item to="/app" label="Home" />
              <Item to="/app/modules" label="Modules" />
              <Item to="/app/faculty" label="Faculty" />
              <Item to="/app/clubs" label="Clubs" />
              <Item to="/app/emergency" label="Emergency" />
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-xs text-slate-400">Signed in as</div>
              <div className="text-sm font-semibold">Dev User</div>
              <div className="text-xs text-slate-500">Role: Student (fake)</div>

              <button
                onClick={logoutDev}
                className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
              >
                Logout (Dev)
              </button>
            </div>
          </aside>

          <main className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <div className="text-lg font-semibold">{title}</div>
                <div className="text-xs text-slate-400">{location.pathname}</div>
              </div>
            </div>

            <div className="p-5">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
