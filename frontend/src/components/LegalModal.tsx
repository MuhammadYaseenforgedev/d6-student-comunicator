import { useEffect } from "react";
import { X } from "lucide-react";
import { LEGAL_CONTENT } from "../lib/legalContent";

type LegalModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function LegalModal({ open, onClose }: LegalModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020C2A]/72 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        className="glass-panel-strong relative max-h-[85vh] w-full max-w-3xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(140,235,255,0.16)] px-6 py-5">
          <div>
            <h2 id="legal-modal-title" className="text-xl font-semibold text-white">
              {LEGAL_CONTENT.title}
            </h2>
            <p className="mt-1 text-sm text-white/65">
              Last Updated: {LEGAL_CONTENT.lastUpdated}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="icon-button shrink-0 p-2"
            aria-label="Close legal terms"
            title="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[calc(85vh-96px)] space-y-6 overflow-y-auto px-6 py-5 text-sm leading-7 text-white/82">
          {LEGAL_CONTENT.sections.map((section) => (
            <section key={section.heading}>
              <h3 className="text-base font-semibold text-[#8CEBFF]">
                {section.heading}
              </h3>

              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3">
                  {paragraph}
                </p>
              ))}

              {section.items?.length ? (
                <ul className="mt-3 space-y-2 text-white/78">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8CEBFF]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
