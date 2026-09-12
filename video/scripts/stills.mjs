// Renders one representative frame per scene so layout can be reviewed without a full encode.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const id = process.argv[2] ?? "ShadowQA-Business";
const outDir = path.join(root, "out", "stills", id);

await import("./extract.mjs");

const frames = process.argv
  .slice(3)
  .map(Number)
  .filter((n) => Number.isFinite(n));

await mkdir(outDir, { recursive: true });

console.log("bundling…");
const serveUrl = await bundle({
  entryPoint: path.join(root, "src", "index.ts"),
  onProgress: (p) => {
    if (p % 25 === 0) process.stdout.write(`  bundle ${p}%\n`);
  },
});

const composition = await selectComposition({ serveUrl, id, inputProps: {} });
const picks = frames.length
  ? frames
  : Array.from({ length: 14 }, (_, i) =>
      Math.round(((i + 0.45) / 14) * composition.durationInFrames),
    );

for (const frame of picks) {
  const output = path.join(outDir, String(frame).padStart(5, "0") + ".png");
  await renderStill({
    composition,
    serveUrl,
    output,
    frame,
    imageFormat: "png",
    chromiumOptions: { gl: "angle" },
  });
  console.log("  " + output);
}
console.log(`${picks.length} stills in ${outDir}`);
