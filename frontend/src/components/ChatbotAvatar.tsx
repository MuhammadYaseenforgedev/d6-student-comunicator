import { motion } from "framer-motion";
import beaconAvatar from "../assets/beacon-avatar.png";

export type ChatbotAvatarMode = "idle" | "thinking" | "speaking";

type ChatbotAvatarProps = {
  mode?: ChatbotAvatarMode;
  size?: number;
  scale?: number;
  className?: string;
};

const BASE_SIZE = 96;

function robotAnimation(mode: ChatbotAvatarMode) {
  switch (mode) {
    case "thinking":
      return {
        y: [0, -4, 0, -2, 0],
        rotate: [0, -2.2, 1.8, -0.8, 0],
        scale: [1, 1.02, 1, 1.012, 1],
      };
    case "speaking":
      return {
        y: [0, -5, 0, -3, 0],
        rotate: [0, -1.8, 2.1, -1, 0],
        scale: [1, 1.024, 0.998, 1.016, 1],
      };
    default:
      return {
        y: [0, -3, 0],
        rotate: [0, -1.3, 1.3, 0],
        scale: [1, 1.01, 1],
      };
  }
}

function robotTransition(mode: ChatbotAvatarMode) {
  switch (mode) {
    case "thinking":
      return { duration: 1.45, repeat: Infinity, ease: "easeInOut" as const };
    case "speaking":
      return { duration: 0.96, repeat: Infinity, ease: "easeInOut" as const };
    default:
      return { duration: 4.1, repeat: Infinity, ease: "easeInOut" as const };
  }
}

function auraAnimation(mode: ChatbotAvatarMode) {
  switch (mode) {
    case "thinking":
      return {
        opacity: [0.2, 0.48, 0.2],
        scale: [0.95, 1.06, 0.95],
      };
    case "speaking":
      return {
        opacity: [0.26, 0.6, 0.26],
        scale: [0.94, 1.1, 0.94],
      };
    default:
      return {
        opacity: [0.16, 0.32, 0.16],
        scale: [0.97, 1.04, 0.97],
      };
  }
}

function shoulderSwing(mode: ChatbotAvatarMode, side: "left" | "right") {
  const sign = side === "left" ? -1 : 1;

  switch (mode) {
    case "thinking":
      return {
        rotate: [sign * 10, sign * 20, sign * 14, sign * 18, sign * 10],
        y: [0, -1, 0, -1, 0],
      };
    case "speaking":
      return {
        rotate: [sign * 12, sign * 30, sign * 16, sign * 24, sign * 12],
        y: [0, -1, 0, -1, 0],
      };
    default:
      return {
        rotate: [sign * 10, sign * 16, sign * 11, sign * 14, sign * 10],
        y: [0, -1, 0],
      };
  }
}

function forearmSwing(mode: ChatbotAvatarMode, side: "left" | "right") {
  const sign = side === "left" ? -1 : 1;

  switch (mode) {
    case "thinking":
      return { rotate: [sign * 22, sign * 38, sign * 24, sign * 32, sign * 22] };
    case "speaking":
      return { rotate: [sign * 18, sign * 48, sign * 22, sign * 38, sign * 18] };
    default:
      return { rotate: [sign * 22, sign * 32, sign * 22] };
  }
}

function pupilMotion(mode: ChatbotAvatarMode, side: "left" | "right") {
  const sign = side === "left" ? -1 : 1;

  switch (mode) {
    case "thinking":
      return {
        x: [0, sign * -1.8, sign * 1.2, 0],
        y: [0, -0.9, 0.6, 0],
        scale: [1, 1.08, 1],
      };
    case "speaking":
      return {
        x: [0, sign * 1.5, sign * -0.8, 0],
        y: [0, -0.5, 0, -0.2, 0],
        scale: [1, 1.12, 1],
      };
    default:
      return {
        x: [0, sign * 1, sign * -0.5, 0],
        y: [0, -0.4, 0.2, 0],
        scale: [1, 1.04, 1],
      };
  }
}

function Eye({
  mode,
  side,
}: {
  mode: ChatbotAvatarMode;
  side: "left" | "right";
}) {
  return (
    <div className="relative flex h-[40%] w-[35%] items-center justify-center">
      <motion.div
        animate={{
          scaleY: [1, 1, 0.16, 1, 1, 1, 0.26, 1],
          opacity: [1, 1, 0.96, 1, 1, 1, 0.92, 1],
        }}
        transition={{
          duration: 5.3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: side === "left" ? 0 : 0.12,
        }}
        className="relative flex h-full w-full origin-center items-center justify-center rounded-full border border-[#bff7ff]/65 bg-[radial-gradient(circle,rgba(217,248,255,0.88),rgba(126,241,255,0.42),rgba(70,34,163,0.2))] shadow-[0_0_14px_rgba(126,241,255,0.4)]"
      >
        <motion.div
          animate={{
            opacity: mode === "speaking" ? [0.46, 0.96, 0.46] : [0.26, 0.64, 0.26],
            scale: mode === "speaking" ? [0.92, 1.18, 0.92] : [0.96, 1.08, 0.96],
          }}
          transition={{
            duration: mode === "speaking" ? 0.82 : 2.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-[18%] rounded-full border border-[#9af7ff]/45"
        />

        <motion.div
          animate={pupilMotion(mode, side)}
          transition={{
            duration: mode === "speaking" ? 0.86 : mode === "thinking" ? 1.2 : 2.1,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="h-[44%] w-[44%] rounded-full bg-[radial-gradient(circle_at_32%_32%,#ffffff,#b7f5ff_26%,#8b5dff_62%,#34208d)] shadow-[0_0_12px_rgba(139,93,255,0.5)]"
        />
      </motion.div>

      <motion.div
        animate={{
          rotate:
            mode === "thinking"
              ? side === "left"
                ? [-8, -13, -8]
                : [8, 13, 8]
              : 0,
          y: mode === "speaking" ? [0, -1, 0] : [0, -0.4, 0],
        }}
        transition={{
          duration: mode === "speaking" ? 0.92 : 2.6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: side === "left" ? 0 : 0.08,
        }}
        className={[
          "absolute top-[-20%] h-[12%] w-[66%] rounded-full bg-[linear-gradient(90deg,rgba(126,241,255,0.16),rgba(234,164,255,0.95),rgba(126,241,255,0.16))] shadow-[0_0_12px_rgba(234,164,255,0.26)]",
          side === "left" ? "-rotate-12" : "rotate-12",
        ].join(" ")}
      />
    </div>
  );
}

function RobotArm({
  mode,
  side,
}: {
  mode: ChatbotAvatarMode;
  side: "left" | "right";
}) {
  const sideConfig =
    side === "left"
      ? {
          wrapper: "left-[1%]",
          shoulder: "right-[8%]",
          upper: "right-[14%]",
          lower: "right-[-4%]",
          hand: "right-[-1%]",
          transformOriginClass: "origin-[88%_16%]",
          forearmOriginClass: "origin-[94%_36%]",
        }
      : {
          wrapper: "right-[1%]",
          shoulder: "left-[8%]",
          upper: "left-[14%]",
          lower: "left-[-4%]",
          hand: "left-[-1%]",
          transformOriginClass: "origin-[12%_16%]",
          forearmOriginClass: "origin-[6%_36%]",
        };

  return (
    <motion.div
      animate={shoulderSwing(mode, side)}
      transition={{
        duration: mode === "speaking" ? 0.96 : mode === "thinking" ? 1.35 : 2.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={`absolute top-[36%] ${sideConfig.wrapper} ${sideConfig.transformOriginClass} z-10 h-[34%] w-[28%]`}
    >
      <div
        className={`absolute top-[5%] ${sideConfig.shoulder} h-[22%] w-[24%] rounded-full border border-white/14 bg-[linear-gradient(180deg,#fafdff,#d9ecff_55%,#7646da)] shadow-[0_8px_14px_rgba(8,17,42,0.28)]`}
      />

      <div
        className={`absolute top-[14%] ${sideConfig.upper} h-[18%] w-[58%] rounded-full border border-white/12 bg-[linear-gradient(180deg,#ffffff,#e4f2ff_52%,#8f63ea)] shadow-[0_10px_16px_rgba(8,17,42,0.24)]`}
      />

      <motion.div
        animate={forearmSwing(mode, side)}
        transition={{
          duration: mode === "speaking" ? 0.84 : mode === "thinking" ? 1.08 : 2.1,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`absolute top-[30%] ${sideConfig.lower} ${sideConfig.forearmOriginClass} h-[18%] w-[62%] rounded-full border border-white/10 bg-[linear-gradient(180deg,#ffffff,#ddf7ff_44%,#78ebff_94%)] shadow-[0_10px_16px_rgba(8,17,42,0.24)]`}
      />

      <div
        className={`absolute top-[40%] ${sideConfig.hand} h-[11%] w-[18%] rounded-full bg-[linear-gradient(180deg,#ebffff,#8ef1ff)] shadow-[0_0_12px_rgba(126,241,255,0.44)]`}
      />
    </motion.div>
  );
}

export default function ChatbotAvatar({
  mode = "idle",
  size,
  scale = 1,
  className = "",
}: ChatbotAvatarProps) {
  const resolvedSize = size ?? Math.round(BASE_SIZE * scale);

  return (
    <motion.div
      animate={{ scale: resolvedSize / BASE_SIZE }}
      transition={{ duration: 0 }}
      className={`relative isolate inline-flex h-24 w-24 shrink-0 items-center justify-center overflow-visible ${className}`}
    >
      <motion.div
        animate={auraAnimation(mode)}
        transition={{
          duration: mode === "speaking" ? 0.94 : mode === "thinking" ? 1.25 : 2.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle,rgba(111,240,255,0.22),rgba(111,125,255,0.14),transparent_72%)] blur-xl"
      />

      <img
        src={beaconAvatar}
        alt=""
        aria-hidden="true"
        className="absolute inset-[18%] h-[64%] w-[64%] rounded-full object-contain opacity-[0.08] blur-[0.5px]"
      />

      <motion.div
        animate={robotAnimation(mode)}
        transition={robotTransition(mode)}
        className="relative h-full w-full"
      >
        <motion.div
          animate={{
            opacity: mode === "speaking" ? [0.18, 0.52, 0.18] : [0.1, 0.26, 0.1],
            scaleX: mode === "speaking" ? [0.92, 1.08, 0.92] : [0.97, 1.03, 0.97],
          }}
          transition={{
            duration: mode === "speaking" ? 0.88 : 2.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute bottom-[2%] left-1/2 h-[14%] w-[64%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(111,240,255,0.6),transparent_72%)] blur-md"
        />

        <RobotArm mode={mode} side="left" />
        <RobotArm mode={mode} side="right" />

        <div className="absolute left-1/2 top-[6%] z-20 h-[44%] w-[72%] -translate-x-1/2">
          <div
            className="absolute inset-0 rounded-[34%_34%_28%_28%_/_30%_30%_36%_36%] border border-white/14 bg-[linear-gradient(180deg,#ffffff,#edf5ff_54%,#8f63ea)] shadow-[0_18px_28px_rgba(4,12,31,0.26)]"
          />

          <div className="absolute inset-x-[16%] top-[6%] h-[12%] rounded-full bg-[linear-gradient(90deg,rgba(164,112,255,0.18),rgba(164,112,255,0.76),rgba(164,112,255,0.18))]" />

          <div
            className="absolute inset-x-[9%] bottom-[12%] top-[21%] overflow-hidden rounded-[30%_30%_28%_28%_/_34%_34%_28%_28%] border border-[#8feaff]/18 bg-[linear-gradient(180deg,rgba(8,17,43,0.98),rgba(11,27,62,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(111,240,255,0.12)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(126,241,255,0.18),transparent_54%)]" />

            {mode === "thinking" && (
              <motion.div
                animate={{ y: ["-16%", "92%", "-16%"], opacity: [0, 0.44, 0] }}
                transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-x-[16%] h-[18%] rounded-full bg-[linear-gradient(180deg,rgba(126,241,255,0.08),rgba(126,241,255,0.38),rgba(126,241,255,0.08))] blur-sm"
              />
            )}

            <div className="absolute inset-x-[10%] top-[27%] flex items-center justify-between">
              <Eye mode={mode} side="left" />
              <Eye mode={mode} side="right" />
            </div>
          </div>

          <div className="absolute inset-x-[22%] top-[10%] h-[10%] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(255,255,255,0.04))] opacity-70 blur-[1px]" />
        </div>

        <div className="absolute left-1/2 top-[46%] z-10 h-[30%] w-[48%] -translate-x-1/2">
          <div
            className="absolute inset-0 rounded-[34%_34%_26%_26%_/_24%_24%_34%_34%] border border-white/12 bg-[linear-gradient(180deg,#fbfdff,#e7f0ff_46%,#6431c8_92%)] shadow-[0_16px_26px_rgba(4,12,31,0.24)]"
          />

          <div className="absolute inset-x-[12%] top-[8%] h-[14%] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(255,255,255,0.02))]" />

          <div
            className="absolute inset-x-[16%] top-[18%] h-[52%] rounded-[26%_26%_34%_34%_/_24%_24%_42%_42%] border border-white/12 bg-[linear-gradient(180deg,rgba(130,74,255,0.82),rgba(37,18,96,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          />

          <motion.div
            animate={{
              scale:
                mode === "speaking"
                  ? [0.96, 1.14, 0.96]
                  : mode === "thinking"
                    ? [0.94, 1.06, 0.94]
                    : [0.96, 1.03, 0.96],
              opacity: mode === "speaking" ? [0.72, 1, 0.72] : [0.56, 0.88, 0.56],
            }}
            transition={{
              duration: mode === "speaking" ? 0.8 : mode === "thinking" ? 1.15 : 2.3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute left-1/2 top-[28%] h-[27%] w-[24%] -translate-x-1/2 rounded-[40%] border border-[#9af7ff]/44 bg-[radial-gradient(circle,#c6fbff,#6eeeff_54%,#1fafff)] shadow-[0_0_18px_rgba(110,238,255,0.54)]"
          />

          <div className="absolute inset-x-[28%] top-[61%] h-[14%] rounded-full bg-[linear-gradient(180deg,rgba(220,244,255,0.18),rgba(103,245,255,0.54),rgba(220,244,255,0.12))]" />
        </div>

        <div className="absolute bottom-[8%] left-1/2 z-0 h-[14%] w-[38%] -translate-x-1/2">
          <div className="absolute left-[4%] top-0 h-[54%] w-[28%] rounded-full bg-[linear-gradient(180deg,#fbfdff,#dcefff_54%,#9268ec)] shadow-[0_10px_16px_rgba(4,12,31,0.24)]" />
          <div className="absolute right-[4%] top-0 h-[54%] w-[28%] rounded-full bg-[linear-gradient(180deg,#fbfdff,#dcefff_54%,#9268ec)] shadow-[0_10px_16px_rgba(4,12,31,0.24)]" />

          <motion.div
            animate={{
              opacity: mode === "speaking" ? [0.24, 0.62, 0.24] : [0.16, 0.38, 0.16],
              scaleY: mode === "speaking" ? [0.92, 1.2, 0.92] : [0.96, 1.08, 0.96],
            }}
            transition={{
              duration: mode === "speaking" ? 0.78 : 1.55,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute bottom-0 left-[6%] h-[48%] w-[22%] rounded-full bg-[linear-gradient(180deg,rgba(198,251,255,0.95),rgba(110,238,255,0.24),transparent)] blur-[1px]"
          />

          <motion.div
            animate={{
              opacity: mode === "speaking" ? [0.24, 0.62, 0.24] : [0.16, 0.38, 0.16],
              scaleY: mode === "speaking" ? [0.92, 1.2, 0.92] : [0.96, 1.08, 0.96],
            }}
            transition={{
              duration: mode === "speaking" ? 0.78 : 1.55,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.08,
            }}
            className="absolute bottom-0 right-[6%] h-[48%] w-[22%] rounded-full bg-[linear-gradient(180deg,rgba(198,251,255,0.95),rgba(110,238,255,0.24),transparent)] blur-[1px]"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
