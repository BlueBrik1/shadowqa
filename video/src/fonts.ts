import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Loaded once at module scope so every composition shares the same faces and no scene
// renders a frame with a fallback metric.
const inter = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
const mono = loadMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
});

export const display = `${inter.fontFamily}, -apple-system, "Segoe UI", sans-serif`;
export const code = `${mono.fontFamily}, "SFMono-Regular", Consolas, monospace`;
export const fontsReady = Promise.all([
  inter.waitUntilDone(),
  mono.waitUntilDone(),
]);
