import { interpolate, spring } from "remotion";

/**
 * The accent is not a design choice made here: `#73e3d3` is the exact colour the shipped CLI
 * prints with (`src/cli/ui.ts`), so the film and the product are the same brand by construction.
 */
export const c = {
  bg: "#06080B",
  bgLift: "#0A0E14",
  panel: "#0D1218",
  panelLift: "#131A22",
  stroke: "rgba(255,255,255,0.09)",
  strokeStrong: "rgba(255,255,255,0.18)",
  text: "#E9EEF4",
  dim: "#78879A",
  faint: "#4A5867",
  cyan: "#73E3D3",
  cyanDeep: "#2BB3A3",
  violet: "#A78BFA",
  amber: "#FBBF24",
  rose: "#FB7185",
  green: "#57D9A3",
  blue: "#60A5FA",
  slack: "#E01E5A",
  github: "#E9EEF4",
  openai: "#10A37F",
  claude: "#D97757",
} as const;

export const font = {
  display:
    '"Inter", "Inter Fallback", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", "JetBrains Mono Fallback", "SFMono-Regular", Consolas, monospace',
} as const;

/** Two springs cover almost everything: things that arrive, and things that settle heavily. */
export const SNAP = { damping: 200, stiffness: 180, mass: 0.7 } as const;
export const SOFT = { damping: 200, stiffness: 90, mass: 1.1 } as const;
export const POP = { damping: 14, stiffness: 220, mass: 0.6 } as const;

type SpringConfig = { damping: number; stiffness: number; mass: number };

export const enter = (
  frame: number,
  fps: number,
  delay = 0,
  config: SpringConfig = SNAP,
) => spring({ frame: frame - delay, fps, config, durationInFrames: 34 });

/** 0 → 1 → 0 envelope so a scene can fade its own content in and out without a parent. */
export const envelope = (
  frame: number,
  duration: number,
  fadeIn = 12,
  fadeOut = 12,
) =>
  interpolate(frame, [0, fadeIn, duration - fadeOut, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** Cubic-bezier style ease for interpolate(), matching the product's unhurried feel. */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const shadow = {
  panel: "0 30px 80px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05)",
  lift: "0 40px 120px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)",
  glow: (color: string, strength = 0.35) =>
    `0 0 60px -10px ${color}${Math.round(strength * 255)
      .toString(16)
      .padStart(2, "0")}`,
};
