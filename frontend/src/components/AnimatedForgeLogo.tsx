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
          viewBox="0 0 60 60"
          className="absolute left-[13px] top-[15px] h-[18px] w-[18px] overflow-visible"
          animate={
            isAnimating
              ? {
                  x: [0, 10, 34, 10, 0],
                  y: [0, -10, 0, 10, 0],
                  rotate: [0, 90, 280, 360, 0],
                  scale: [1, 1.05, 1.1, 1.05, 1],
                }
              : {
                  x: 0,
                  y: 0,
                  rotate: 0,
                  scale: 1,
                }
          }
          transition={{
            duration: 1.8,
            ease: "easeInOut",
            times: [0, 0.22, 0.5, 0.78, 1],
          }}
          style={{ transformOrigin: "50% 50%" }}
        >
          <defs>
            <linearGradient
              id="forge-purple-gradient-small"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
          </defs>

          <path
            d="M14 6C10.6863 6 8 8.68629 8 12V48C8 51.3137 10.6863 54 14 54C15.3031 54 16.5717 53.5758 17.614 52.791L42.014 34.791C43.5489 33.6568 44.4552 31.8656 44.4552 30C44.4552 28.1344 43.5489 26.3432 42.014 25.209L17.614 7.20903C16.5717 6.4242 15.3031 6 14 6Z"
            fill="url(#forge-purple-gradient-small)"
          />
        </motion.svg>

        <motion.svg
          viewBox="0 0 60 60"
          className="absolute left-[24px] top-[15px] h-[18px] w-[18px] overflow-visible"
          animate={
            isAnimating
              ? {
                  x: [0, 14, 42, 14, 0],
                  y: [0, -6, 0, 6, 0],
                  rotate: [0, -90, -280, -360, 0],
                  scale: [1, 1.05, 1.1, 1.05, 1],
                }
              : {
                  x: 0,
                  y: 0,
                  rotate: 0,
                  scale: 1,
                }
          }
          transition={{
            duration: 1.8,
            ease: "easeInOut",
            times: [0, 0.22, 0.5, 0.78, 1],
            delay: 0.05,
          }}
          style={{ transformOrigin: "50% 50%" }}
        >
          <defs>
            <linearGradient
              id="forge-cyan-gradient-small"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#67E8F9" />
              <stop offset="100%" stopColor="#4DDDE0" />
            </linearGradient>
          </defs>

          <path
            d="M14 6C10.6863 6 8 8.68629 8 12V48C8 51.3137 10.6863 54 14 54C15.3031 54 16.5717 53.5758 17.614 52.791L42.014 34.791C43.5489 33.6568 44.4552 31.8656 44.4552 30C44.4552 28.1344 43.5489 26.3432 42.014 25.209L17.614 7.20903C16.5717 6.4242 15.3031 6 14 6Z"
            fill="url(#forge-cyan-gradient-small)"
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
