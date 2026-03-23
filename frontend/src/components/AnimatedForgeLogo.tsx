import { useCallback, useState } from "react";
import { motion } from "framer-motion";

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

        <motion.svg
          viewBox="0 0 72 72"
          className="absolute left-[8px] top-[8px] h-[36px] w-[36px] overflow-visible"
          aria-hidden="true"
          animate={
            isAnimating
              ? {
                  rotate: [0, -12, 8, -5, 0],
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
        >
          <defs>
            <linearGradient
              id="forge-purple-gradient-mark"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#B56DFF" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient
              id="forge-cyan-gradient-mark"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#86F7FF" />
              <stop offset="100%" stopColor="#42D4F5" />
            </linearGradient>
          </defs>

          <motion.path
            d="M13 10C9.686 10 7 12.686 7 16V56C7 59.314 9.686 62 13 62C14.41 62 15.781 61.503 16.868 60.597L43.268 38.597C44.64 37.454 45.428 35.761 45.428 34C45.428 32.239 44.64 30.546 43.268 29.403L16.868 7.403C15.781 6.497 14.41 6 13 6Z"
            fill="url(#forge-purple-gradient-mark)"
            animate={
              isAnimating
                ? {
                    x: [0, -1, 1, 0],
                    scale: [1, 1.02, 1.04, 1],
                  }
                : {
                    x: 0,
                    scale: 1,
                  }
            }
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />

          <motion.path
            d="M24 10C20.686 10 18 12.686 18 16V56C18 59.314 20.686 62 24 62C25.41 62 26.781 61.503 27.868 60.597L54.268 38.597C55.64 37.454 56.428 35.761 56.428 34C56.428 32.239 55.64 30.546 54.268 29.403L27.868 7.403C26.781 6.497 25.41 6 24 6Z"
            fill="url(#forge-cyan-gradient-mark)"
            animate={
              isAnimating
                ? {
                    x: [0, 1, -1, 0],
                    scale: [1, 1.03, 1.05, 1],
                  }
                : {
                    x: 0,
                    scale: 1,
                  }
            }
            transition={{ duration: 1.2, ease: "easeInOut", delay: 0.04 }}
          />
        </motion.svg>
      </div>

      <div className="min-w-0 flex-1">
        <div className="app-title-gradient text-[1rem] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[1.15rem]">
          Forge Communicator
        </div>
      </div>
    </div>
  );
}
