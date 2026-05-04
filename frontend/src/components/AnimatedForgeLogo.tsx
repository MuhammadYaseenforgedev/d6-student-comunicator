import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useLocation } from "react-router-dom";
import forgeMark from "../assets/forge-mark.png";

export default function AnimatedForgeLogo() {
  const [isClickAnimating, setIsClickAnimating] = useState(false);

  const clickControls = useAnimationControls();
  const pageSpinControls = useAnimationControls();

  const textRef = useRef<HTMLDivElement | null>(null);
  const firstRenderRef = useRef(true);
  const clickTimeoutRef = useRef<number | null>(null);
  const location = useLocation();

  const runClickAnimation = useCallback(() => {
    if (isClickAnimating) return;

    const textWidth = textRef.current?.offsetWidth ?? 180;
    const travelX = Math.max(140, textWidth);

    setIsClickAnimating(true);

    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    void clickControls.start({
      x: [0, 40, travelX * 0.35, travelX * 0.72, travelX * 0.42, 0],
      y: [0, -28, -42, 0, 28, 0],
      rotate: [0, 180, 360, 540, 720, 720],
      scale: [1, 1.03, 1.05, 1.05, 1.03, 1],
      transition: {
        duration: 2.2,
        ease: "easeInOut",
        times: [0, 0.14, 0.34, 0.58, 0.82, 1],
      },
    });

    clickTimeoutRef.current = window.setTimeout(() => {
      void clickControls.set({
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
      });
      setIsClickAnimating(false);
      clickTimeoutRef.current = null;
    }, 2200);
  }, [clickControls, isClickAnimating]);

  const runPageSpinAnimation = useCallback(() => {
    if (isClickAnimating) return;

    void pageSpinControls.start({
      rotate: [0, 360],
      scale: [1, 1.04, 1],
      transition: {
        duration: 0.7,
        ease: "easeInOut",
      },
    });

    window.setTimeout(() => {
      void pageSpinControls.set({
        rotate: 0,
        scale: 1,
      });
    }, 700);
  }, [isClickAnimating, pageSpinControls]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }

    runPageSpinAnimation();
  }, [location.pathname, runPageSpinAnimation]);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      onClick={runClickAnimation}
      className="relative flex w-full min-w-0 items-center gap-3 cursor-pointer select-none overflow-visible"
      title="Animate logo"
      aria-label="Animate logo"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          runClickAnimation();
        }
      }}
    >
      <div className="relative h-[52px] w-[52px] shrink-0 overflow-visible">
        <svg
          viewBox="0 0 140 140"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <circle cx="70" cy="70" r="62" fill="#161216" />
          <circle cx="70" cy="70" r="48" fill="#FFFFFF" />
        </svg>

        {/* Page-change spin wrapper */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={pageSpinControls}
          initial={{ rotate: 0, scale: 1 }}
          style={{ transformOrigin: "50% 50%" }}
        >
          {/* Click animation mark */}
          <motion.img
            src={forgeMark}
            alt=""
            className="h-[60px] w-[60px] object-contain pointer-events-none"
            animate={clickControls}
            initial={{ x: 0, y: 0, rotate: 0, scale: 1 }}
            style={{ transformOrigin: "50% 50%" }}
            draggable={false}
          />
        </motion.div>
      </div>

      <div ref={textRef} className="min-w-0 flex-1">
        <div className="app-title-gradient text-[1rem] font-extrabold leading-[1.3] tracking-[-0.03em] md:text-[1.60rem]">
          Forge Communicator
        </div>
      </div>
    </div>
  );
}