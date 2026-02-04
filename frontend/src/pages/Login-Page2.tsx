import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setDevBypass } from "../lib/auth";

type LocationState = {
  from?: string;
};

export default function LoginPage2() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const from = (location.state as LocationState | null)?.from ?? "/app";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDevBypass(true);
    navigate(from, { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight">D6 Communicator</h1>

        <p className="mt-2 text-slate-400">
          Development login (backend auth disabled)
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-300">Email</label>
            <input
              type="email"
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300">Password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-3 font-semibold hover:bg-blue-700 transition"
          >
            Sign In (Bypass)
          </button>

          <p className="text-xs text-slate-500 text-center">
            Dev bypass enabled. Authentication will be added later.
          </p>
        </form>
      </div>
    </div>
  );
}

