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

export default function AppFooter() {
  return (
    <footer className="bg-transparent">
      <div className="mx-auto max-w-7xl px-4">
        {/* 5cm height */}
        <div className="glass-panel p-0 min-h-[189px] flex flex-col justify-between">

          {/* TOP SECTION */}
          <div className="px-8 pt-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr_1fr] items-center">

              {/* Contact */}
              <div className="space-y-3 text-sm text-white/82">
                <h3 className="text-lg font-semibold text-white">
                  Contact Details
                </h3>

                <a
                  href="https://maps.app.goo.gl/pxxgunzzqpLs7N1j8?g_st=aw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2"
                >
                  <MapPin size={16} className="mt-0.5 text-[#8C5BFF]" />
                  <span>
                    Building 6, Clearwater Office Park
                    <br />
                    Millenium Blvd, Strubens Valley
                    <br />
                    Roodepoort, 1735
                  </span>
                </a>

                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-[#8CEBFF]" />
                  <a href="tel:+27108803795">+27 10 880 3795</a>
                </div>

                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-[#8CEBFF]" />
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
                  className="h-16 w-auto object-contain"
                />

                <div className="mt-2 text-sm font-medium text-white/75">
                  Powered by Ozone Connect
                </div>
              </div>

              {/* SOCIALS */}
              <div className="flex flex-col items-start lg:items-end">
                <div className="text-sm uppercase tracking-[0.25em] text-white/75">
                  Join Us on the Journey
                </div>

                <div className="mt-4 flex gap-2">
                  <a
                    href="https://www.facebook.com/ForgeAcademySA"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-button"
                    aria-label="Forge Academy Facebook"
                  >
                    <Facebook size={18} />
                  </a>

                  <a
                    href="https://www.instagram.com/forge_academy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-button"
                    aria-label="Forge Academy Instagram"
                  >
                    <Instagram size={18} />
                  </a>

                  <a
                    href="https://www.linkedin.com/company/forgeacademy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-button"
                    aria-label="Forge Academy LinkedIn"
                  >
                    <Linkedin size={18} />
                  </a>

                  <a
                    href="https://x.com/forgeacademyza"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-button"
                    aria-label="Forge Academy Twitter"
                  >
                    <Twitter size={18} />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* PARTNER LOGOS */}
          <div className="flex flex-col items-center pb-1">
            <div className="flex flex-wrap items-center justify-center gap-x-10">
              {partnerLogos.map((logo) => (
                <a
                  key={logo.name}
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={logo.name}
                  title={logo.name}
                >
                  <img
                    src={logo.src}
                    alt={logo.name}
                    className={`${logo.size} w-auto object-contain transition duration-200 hover:scale-105`}
                  />
                </a>
              ))}
            </div>

            <div className="mt-4 text-xs text-white/70">
              © {new Date().getFullYear()} Forge Academy
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}