/**
 * ShadowQA brand.
 *
 * Two colours only: charcoal (`#1C1C1C`) and off-white (`#F4F1EA`). Red marks a failure, green
 * marks a verified success; nothing else is coloured. The same values are read by the desktop
 * app, the side panel, the Live overlay, the film and the slides, so every surface is the same
 * product by construction.
 */
export const BRAND = { charcoal: "#1C1C1C", offwhite: "#F4F1EA" } as const;
export const ACCENT = {
  soft: "#A9A59D",
  dim: "#6F6C66",
  bad: "#E5484D",
  good: "#3DD68C",
} as const;
export const GLYPH = {
  mark: "◈",
  step: "◇",
  ok: "✓",
  err: "✕",
  live: "◉",
  watch: "◌",
} as const;
