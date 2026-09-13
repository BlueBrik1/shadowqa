import { interpolate, spring } from "remotion";

/**
 * The film's palette is the product's palette. `BRAND` in `src/core/brand.ts` is what the desktop
 * app's renderer theme, the side panel and the Live overlay are painted in, and what this film uses
 * for its ground and its ink. `video/scripts/extract.mjs` quotes that declaration on screen and
 * fails the build if it moves.
 *
 * Two colours. Red for something wrong, green for something verified. Syntax highlighting inside
 * code blocks is the only other place a hue appears.
 */
export const BRAND = { charcoal: "#1C1C1C", offwhite: "#F4F1EA" } as const;

export const c = {
  charcoal: BRAND.charcoal,
  offwhite: BRAND.offwhite,
  /** Tints of the two brand colours, for hierarchy without a third colour. */
  charcoalLift: "#262626",
  charcoalDeep: "#141414",
  offwhiteDeep: "#E9E5DB",
  offwhiteLift: "#FAF8F3",
  dim: "#A9A59D",
  faint: "#6F6C66",
  bad: "#E5484D",
  good: "#3DD68C",
} as const;

/** A frame is either dark ground with light ink, or light ground with dark ink. */
export type Tone = "dark" | "light";
export const tone = (t: Tone) =>
  t === "dark"
    ? {
        bg: c.charcoal,
        bgLift: c.charcoalLift,
        bgDeep: c.charcoalDeep,
        ink: c.offwhite,
        dim: c.dim,
        faint: c.faint,
        rule: "rgba(244,241,234,0.14)",
        ruleStrong: "rgba(244,241,234,0.28)",
        panel: c.charcoalLift,
        panelInk: c.offwhite,
      }
    : {
        bg: c.offwhite,
        bgLift: c.offwhiteLift,
        bgDeep: c.offwhiteDeep,
        ink: c.charcoal,
        dim: c.faint,
        faint: c.dim,
        rule: "rgba(28,28,28,0.14)",
        ruleStrong: "rgba(28,28,28,0.30)",
        panel: c.offwhiteLift,
        panelInk: c.charcoal,
      };

export const font = {
  sans: '"Work Sans", "Work Sans Fallback", -apple-system, "Segoe UI", sans-serif',
  serif: '"Source Serif 4", "Source Serif Pro", "Source Serif 4 Fallback", Georgia, serif',
  /** Code is set in the system monospace; no third typeface is introduced. */
  mono: 'Consolas, "SFMono-Regular", Menlo, monospace',
} as const;

export const SNAP = { damping: 200, stiffness: 180, mass: 0.7 } as const;
export const SOFT = { damping: 200, stiffness: 90, mass: 1.1 } as const;
type SpringConfig = { damping: number; stiffness: number; mass: number };

export const enter = (
  frame: number,
  fps: number,
  delay = 0,
  config: SpringConfig = SNAP,
) => spring({ frame: frame - delay, fps, config, durationInFrames: 34 });

export const envelope = (
  frame: number,
  duration: number,
  fadeIn = 12,
  fadeOut = 12,
) => {
  // Zero-length fades (stills, slides) must not produce a degenerate input range.
  const inEnd = Math.max(fadeIn, 0.001);
  const outStart = Math.min(duration - Math.max(fadeOut, 0.001), duration - 0.001);
  return interpolate(frame, [0, inEnd, Math.max(outStart, inEnd + 0.001), duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** 0→1 over [start, start+len], eased; the one timing helper most scenes need. */
export const over = (frame: number, start: number, len: number) =>
  interpolate(frame, [start, start + len], [0, 1], { ...clamp, easing: easeInOut });
