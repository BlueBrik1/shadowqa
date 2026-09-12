import { loadFont as loadWorkSans } from "@remotion/google-fonts/WorkSans";
import { loadFont as loadSourceSerif } from "@remotion/google-fonts/SourceSerif4";

// Loaded once at module scope so every frame renders with the real faces. Source Serif Pro is
// published on Google Fonts as "Source Serif 4"; it is the same design.
const sans = loadWorkSans("normal", {
  weights: ["300", "400", "500", "600"],
  subsets: ["latin"],
});
const serif = loadSourceSerif("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
});

export const sansFamily = `${sans.fontFamily}, -apple-system, "Segoe UI", sans-serif`;
export const serifFamily = `${serif.fontFamily}, "Source Serif Pro", Georgia, serif`;
export const fontsReady = Promise.all([sans.waitUntilDone(), serif.waitUntilDone()]);
