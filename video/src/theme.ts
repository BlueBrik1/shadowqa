import { interpolate, spring } from "remotion";

/**
 * The brand is not a design choice made here. `BRAND` in `src/cli/ui.ts` is what the shipped CLI
 * prints with, what the side panel is painted in, and what the film uses for its ground, its ink
 * and its accent — so the film and the product are the same brand by construction rather than by
 * someone remembering to keep two palettes in step.
 *
 * `video/scripts/extract.mjs` quotes that same declaration on screen, and fails the build if it
 * ever moves.
 */
export const BRAND = { charcoal: "#1C1C1C", offwhite: "#F4F1EA" } as const;

export const c = {
  // A shade under the product's charcoal, so panels painted in charcoal still lift off the ground.
  bg: "#121212",
  bgLift: "#181818",
  panel: BRAND.charcoal,
  panelLift: "#232323",
  stroke: "rgba(244,241,234,0.10)",
  strokeStrong: "rgba(244,241,234,0.20)",
  text: BRAND.offwhite,
  dim: "#A9A59D",
  faint: "#6F6C66",
  /** The accent is the product's ink; `cyan` is kept as the token name the scenes already use. */
  cyan: BRAND.offwhite,
  cyanDeep: "#A9A59D",
  violet: "#A78BFA",
  amber: "#FBBF24",
  rose: "#E5484D",
  green: "#3DD68C",
  blue: "#60A5FA",
  slack: "#E01E5A",
  github: BRAND.offwhite,
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
