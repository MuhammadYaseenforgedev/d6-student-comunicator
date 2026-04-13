// src/components/AppFooter.tsx

import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";

import forgeLogo from "../assets/Forge.jpg";
import awsLogo from "../assets/AWS.png";
import compTiaLogo from "../assets/CompTia.png";
import mictSetaLogo from "../assets/mictseta.png";
import nokiaBellLabsLogo from "../assets/NokiaBellLabs.png";
import nokiaLogo from "../assets/Nokia.png";
import uxDesignInstituteLogo from "../assets/UXDesignInstitue.png";

type AppFooterProps = {
  onOpenLegal?: () => void;
};

const partnerLogos = [
  {
    name: "AWS",
    src: awsLogo,
    href: "https://aws.amazon.com/training/restart/",
    size: "h-20",
  },
  {
    name: "CompTIA",
    src: compTiaLogo,
    href: "https://www.comptia.org/en-US/",
    size: "h-20",
  },
  {
    name: "MICT SETA",
    src: mictSetaLogo,
    href: "https://www.mict.org.za/",
    size: "h-20",
  },
  {
    name: "Nokia Bell Labs",
    src: nokiaBellLabsLogo,
    href: "https://www.nokia.com/bell-labs/",
    size: "h-14",
  },
  {
    name: "Nokia",
    src: nokiaLogo,
    href: "https://digitalmarketinginstitute.com/",
    size: "h-14",
  },
  {
    name: "UX Design Institute",
    src: uxDesignInstituteLogo,
    href: "https://www.uxdesigninstitute.com/",
    size: "h-14",
  },
];

export default function AppFooter({ onOpenLegal }: AppFooterProps) {
  return (
    <footer className="bg-transparent">
      <div className="w-full px-3 sm:px-4 lg:px-6 xl:px-8 2xl:px-10">
        <div className="app-footer-shell glass-panel relative min-h-[189px] overflow-hidden p-0">
          <div className="sidebar-gradient-border-overlay absolute inset-0" />
          <div className="flex h-full flex-col justify-between">
            {/* TOP SECTION */}
            <div className="px-5 pt-5 sm:px-8 sm:pt-6">
              <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.6fr_1fr]">
                {/* Contact */}
                <div className="space-y-3 text-center text-sm text-white/82 lg:text-left">
                  <h3 className="text-lg font-semibold text-white">
                    Contact Details
                  </h3>

                  <a
                    href="https://maps.app.goo.gl/pxxgunzzqpLs7N1j8?g_st=aw"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-center gap-2 lg:justify-start"
                  >
                    <MapPin
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 text-[#8C5BFF]"
                    />
                    <span>
                      Building 6, Clearwater Office Park
                      <br />
                      Millenium Blvd, Strubens Valley
                      <br />
                      Roodepoort, 1735
                    </span>
                  </a>

                  <div className="flex items-center justify-center gap-2 lg:justify-start">
                    <Phone size={16} aria-hidden="true" className="text-[#8CEBFF]" />
                    <a href="tel:+27108803795">+27 10 880 3795</a>
                  </div>

                  <div className="flex items-center justify-center gap-2 lg:justify-start">
                    <Mail size={16} aria-hidden="true" className="text-[#8CEBFF]" />
                    <a href="mailto:hello@forgeacademy.co.za">
                      hello@forgeacademy.co.za
                    </a>
                  </div>
                </div>

                {/* CENTER BRANDING */}
                <div className="flex flex-col items-center justify-center text-center">
                  <img
                    src={forgeLogo}
                    alt="Forge Academy"
                    className="h-20 w-auto object-contain sm:h-28 lg:h-32"
                  />

                  <div className="mt-2 text-sm font-medium text-white/75">
                    Powered by Ozone Connect
                  </div>
                </div>

                {/* SOCIALS */}
                <div className="flex flex-col items-center lg:items-end">
                  <div className="text-sm uppercase tracking-[0.25em] text-white/75">
                    Join Us on the Journey
                  </div>

                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <a
                      href="https://www.facebook.com/ForgeAcademySA"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Visit Forge Academy on Facebook"
                      className="icon-button"
                    >
                      <Facebook size={18} aria-hidden="true" />
                    </a>

                    <a
                      href="https://www.instagram.com/forge_academy/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Visit Forge Academy on Instagram"
                      className="icon-button"
                    >
                      <Instagram size={18} aria-hidden="true" />
                    </a>

                    <a
                      href="https://www.linkedin.com/company/forgeacademy"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Visit Forge Academy on LinkedIn"
                      className="icon-button"
                    >
                      <Linkedin size={18} aria-hidden="true" />
                    </a>

                    <a
                      href="https://x.com/forgeacademyza"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Visit Forge Academy on X"
                      className="icon-button"
                    >
                      <Twitter size={18} aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* PARTNER LOGOS */}
            <div className="flex flex-col items-center px-4 pb-4 pt-2 sm:px-6">
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-10">
                {partnerLogos.map((logo) => (
                  <a
                    key={logo.name}
                    href={logo.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit ${logo.name}`}
                  >
                    <img
                      src={logo.src}
                      alt={logo.name}
                      className={`${logo.size} max-h-12 w-auto object-contain transition duration-200 hover:scale-105 sm:max-h-16 lg:max-h-none`}
                    />
                  </a>
                ))}
              </div>

              <div className="mt-4 text-xs text-white/70">
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                  <span>&copy; {new Date().getFullYear()} Forge Academy</span>
                  <span className="hidden text-white/35 sm:inline">|</span>
                  <button
                    type="button"
                    onClick={onOpenLegal}
                    className="text-[#8CEBFF] transition hover:text-white focus:outline-none focus:text-white"
                  >
                    Legal &amp; Privacy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
