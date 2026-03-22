import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import forgeLogo from "../assets/forge-logo.png";

export default function AnimatedForgeLogo() {
  const [isAnimating, setIsAnimating] = useState(false);

  const triggerAnimation = useCallback(() => {
    if (isAnimating) return;

    setIsAnimating(true);

    window.setTimeout(() => {
      setIsAnimating(false);
    }, 1800);
  }, [isAnimating]);

  return (
    <div
      onClick={triggerAnimation}
      className="flex w-full min-w-0 items-center gap-3 cursor-pointer select-none"
      title="Animate logo"
      aria-label="Animate logo"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          triggerAnimation();
        }
      }}
    >
      <div className="relative h-[52px] w-[52px] shrink-0">
        <svg
          viewBox="0 0 140 140"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <circle cx="70" cy="70" r="62" fill="#161216" />
          <circle cx="70" cy="70" r="48" fill="#FFFFFF" />
        </svg>

        <motion.img
          src={forgeLogo}
          alt="Forge logo"
          className="absolute left-[8px] top-[8px] h-[36px] w-[36px] object-contain"
          animate={
            isAnimating
              ? {
                  rotate: [0, -10, 8, -4, 0],
                  scale: [1, 1.08, 1.12, 1.06, 1],
                  y: [0, -1, 1, 0],
                  filter: [
                    "drop-shadow(0 0 0 rgba(140,91,255,0))",
                    "drop-shadow(0 0 10px rgba(140,91,255,0.32))",
                    "drop-shadow(0 0 14px rgba(103,232,249,0.42))",
                    "drop-shadow(0 0 10px rgba(140,91,255,0.28))",
                    "drop-shadow(0 0 0 rgba(140,91,255,0))",
                  ],
                }
              : {
                  rotate: 0,
                  scale: 1,
                  y: 0,
                  filter: "drop-shadow(0 0 0 rgba(140,91,255,0))",
                }
          }
          transition={{
            duration: 1.2,
            ease: "easeInOut",
            times: [0, 0.2, 0.5, 0.78, 1],
          }}
          style={{ transformOrigin: "50% 50%" }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="app-title-gradient text-[1rem] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[1.15rem]">
          Forge Communicator
        </div>
      </div>
    </div>
  );
}
