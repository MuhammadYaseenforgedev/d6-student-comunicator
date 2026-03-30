import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import forgeMark from "../assets/forge-mark.png";

export default function AnimatedForgeLogo() {
  const [isAnimating, setIsAnimating] = useState(false);
  const [travelX, setTravelX] = useState(180);

  const textRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function updateTravel() {
      const textWidth = textRef.current?.offsetWidth ?? 0;
      if (!textWidth) return;
      setTravelX(Math.max(140, textWidth));
    }

    updateTravel();
    window.addEventListener("resize", updateTravel);
    return () => window.removeEventListener("resize", updateTravel);
  }, []);

  const triggerAnimation = useCallback(() => {
    if (isAnimating) return;

    setIsAnimating(true);

    window.setTimeout(() => {
      setIsAnimating(false);
    }, 2200);
  }, [isAnimating]);

  return (
    <div
      onClick={triggerAnimation}
      className="relative flex w-full min-w-0 items-center gap-3 cursor-pointer select-none overflow-visible"
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
      <div className="relative h-[52px] w-[52px] shrink-0 overflow-visible">
        {/* Outer dark ring + inner white disk */}
        <svg
          viewBox="0 0 140 140"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <circle cx="70" cy="70" r="62" fill="#161216" />
          <circle cx="70" cy="70" r="48" fill="#FFFFFF" />
        </svg>

        {/* Exact forge mark image with spin-around animation */}
        <motion.img
          src={forgeMark}
          alt=""
          className="absolute inset-0 m-auto h-[60px] w-[60px] object-contain pointer-events-none"
          animate={
            isAnimating
              ? {
                  x: [0, 40, travelX * 0.35, travelX * 0.72, travelX * 0.42, 0],
                  y: [0, -28, -42, 0, 28, 0],
                  rotate: [0, 180, 360, 540, 720, 720],
                  scale: [1, 1.03, 1.05, 1.05, 1.03, 1],
                }
              : {
                  x: 0,
                  y: 0,
                  rotate: 0,
                  scale: 1,
                }
          }
          transition={{
            duration: 2.2,
            ease: "easeInOut",
            times: [0, 0.14, 0.34, 0.58, 0.82, 1],
          }}
          style={{ transformOrigin: "50% 50%" }}
          draggable={false}
        />
      </div>

      <div ref={textRef} className="min-w-0 flex-1">
        <div className="app-title-gradient text-[1rem] font-extrabold leading-[1.3] tracking-[-0.03em] md:text-[1.60rem]">
          Forge Communicator
        </div>
      </div>
    </div>
  );
}