// src/components/AppFooter.tsx
// Global application footer.
// Responsibilities:
// - Show contact information
// - Provide social media links
// - Match the new light, minimal, professional aesthetic

import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";

export default function AppFooter() {
  return (
    <footer className="bg-transparent">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="glass-panel p-0">
          <div className="grid gap-12 px-10 py-10 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  Contact Details
                </h3>
              </div>

              <div className="space-y-3 text-sm text-black">
                <a
                  href="https://maps.app.goo.gl/pxxgunzzqpLs7N1j8?g_st=aw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-xl p-2 -m-2 transition duration-200 hover:bg-[#4EC2F3]/8 hover:text-purple-700"
                  title="Open Forge Academy location in Google Maps"
                >
                  <MapPin size={16} className="mt-0.5 text-[#794DFA]" />
                  <span>
                    Building 6, Clearwater Office Park
                    <br />
                    Millenium Blvd, Strubens Valley
                    <br />
                    Roodepoort, 1735
                  </span>
                </a>

                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-[#4EC2F3]" />
                  <a
                    href="tel:+27108803795"
                    className="transition duration-200 hover:text-purple-700"
                  >
                    +27 10 880 3795
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-[#4EC2F3]" />
                  <a
                    href="mailto:hello@forgeacademy.co.za"
                    className="transition duration-200 hover:text-purple-700"
                  >
                    hello@forgeacademy.co.za
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start justify-center md:items-end">
              <div className="text-sm uppercase tracking-[0.25em] text-black">
                Join Us on the Journey
              </div>

              <div className="mt-5 flex gap-5">
                <a
                  href="https://www.facebook.com/ForgeAcademySA"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Forge Academy Facebook"
                  aria-label="Forge Academy Facebook"
                  className="icon-button"
                >
                  <Facebook size={18} />
                </a>

                <a
                  href="https://www.instagram.com/forge_academy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Forge Academy Instagram"
                  aria-label="Forge Academy Instagram"
                  className="icon-button"
                >
                  <Instagram size={18} />
                </a>

                <a
                  href="https://www.linkedin.com/company/forgeacademy"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Forge Academy LinkedIn"
                  aria-label="Forge Academy LinkedIn"
                  className="icon-button"
                >
                  <Linkedin size={18} />
                </a>

                <a
                  href="https://x.com/forgeacademyza"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Forge Academy Twitter"
                  aria-label="Forge Academy Twitter"
                  className="icon-button"
                >
                  <Twitter size={18} />
                </a>
              </div>

              <div className="mt-8 text-xs text-black">
                © {new Date().getFullYear()} Forge Academy. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}