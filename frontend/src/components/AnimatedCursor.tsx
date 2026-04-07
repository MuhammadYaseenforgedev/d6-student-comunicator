import { useEffect, useRef, useState } from "react";
import forgeMark from "../assets/forge-mark.png";

const CLICKABLE_SELECTOR = [
  "button",
  "a",
  "[role='button']",
  "summary",
  ".btn-primary",
  ".btn-secondary",
  ".btn-danger",
  ".icon-button",
  ".nav-item",
  ".tab-pill",
  "[data-cursor-hover='true']",
].join(", ");

const TEXT_INPUT_SELECTOR = [
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio'])",
  "textarea",
  "[contenteditable='true']",
  "[data-native-cursor='true']",
].join(", ");

function isHtmlElement(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement;
}

export default function AnimatedCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetPositionRef = useRef({ x: 0, y: 0 });
  const currentPositionRef = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(false);

  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [textMode, setTextMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: fine)");
    const updateEnabled = () => setEnabled(mediaQuery.matches);

    updateEnabled();
    mediaQuery.addEventListener("change", updateEnabled);

    return () => {
      mediaQuery.removeEventListener("change", updateEnabled);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove("forge-cursor-enabled");
      return;
    }

    document.body.classList.add("forge-cursor-enabled");
    return () => {
      document.body.classList.remove("forge-cursor-enabled");
    };
  }, [enabled]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!enabled) return;

    const startX = window.innerWidth / 2;
    const startY = window.innerHeight / 2;
    targetPositionRef.current = { x: startX, y: startY };
    currentPositionRef.current = { x: startX, y: startY };

    const updateMode = (target: EventTarget | null) => {
      if (!isHtmlElement(target)) {
        setInteractive(false);
        setTextMode(false);
        return;
      }

      const nextTextMode = Boolean(target.closest(TEXT_INPUT_SELECTOR));
      const nextInteractive =
        !nextTextMode && Boolean(target.closest(CLICKABLE_SELECTOR));

      setTextMode((previous) =>
        previous === nextTextMode ? previous : nextTextMode
      );
      setInteractive((previous) =>
        previous === nextInteractive ? previous : nextInteractive
      );
    };

    const animate = () => {
      const node = cursorRef.current;
      const current = currentPositionRef.current;
      const target = targetPositionRef.current;

      current.x += (target.x - current.x) * 0.22;
      current.y += (target.y - current.y) * 0.22;

      if (node) {
        node.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      }

      rafRef.current = window.requestAnimationFrame(animate);
    };

    const handleMouseMove = (event: MouseEvent) => {
      targetPositionRef.current = { x: event.clientX, y: event.clientY };
      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
      updateMode(event.target);
    };

    const handleMouseDown = (event: MouseEvent) => {
      updateMode(event.target);
    };

    const handleMouseLeave = () => {
      visibleRef.current = false;
      setVisible(false);
      setInteractive(false);
      setTextMode(false);
    };

    const handleMouseEnter = (event: MouseEvent) => {
      targetPositionRef.current = { x: event.clientX, y: event.clientY };
      currentPositionRef.current = { x: event.clientX, y: event.clientY };
      visibleRef.current = true;
      setVisible(true);
      updateMode(event.target);
    };

    rafRef.current = window.requestAnimationFrame(animate);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter as EventListener);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter as EventListener);

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      className={[
        "forge-cursor-shell",
        visible && !textMode ? "is-visible" : "",
        interactive ? "is-interactive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="forge-cursor-visual">
        <img
          src={forgeMark}
          alt=""
          className="forge-cursor-mark"
          draggable={false}
        />
      </div>
    </div>
  );
}
