// src/components/AppFooter.tsx
// Proportional enterprise footer.
// Uses the Forge footer image as a subtle background layer, not a huge banner.

import footerImg from "../assets/forge-footer.jpg";

export default function AppFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/30">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/10">
          {/* Background image kept subtle */}
          <img
            src={footerImg}
            alt="Forge Academy footer"
            className="absolute inset-0 h-full w-full object-cover opacity-25"
          />

          {/* Overlays to prevent “zoomed banner” look */}
          <div className="absolute inset-0 bg-slate-950/70" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/70 to-slate-950" />

          {/* Content */}
          <div className="relative z-10 grid gap-6 p-6 md:grid-cols-2">
            <div>
              <div className="text-base font-semibold text-white">Forge Academy</div>
              <div className="mt-2 space-y-1 text-sm text-slate-300">
                <div>Northlands Retail Park</div>
                <div>210 Epsom Ave, Randburg</div>
                <div>+27 10 880 3795</div>
                <div>hello@forgeacademy.co.za</div>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end justify-between">
              <div className="text-sm text-slate-300">Join us on the journey</div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Facebook</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Instagram</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">LinkedIn</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Twitter</span>
              </div>

              <div className="mt-4 text-xs text-slate-400">
                © 2026 Forge Academy. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
