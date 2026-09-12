// Renders the one ShadowQA film to deliverables/shadowqa.mp4 (or the path given as an argument).
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repo = path.resolve(root, "..");
const output = process.argv[2] ?? path.join(repo, "deliverables", "shadowqa.mp4");

await mkdir(path.dirname(output), { recursive: true });

console.log("bundling…");
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts") });
const composition = await selectComposition({ serveUrl, id: "ShadowQA", inputProps: {} });

let last = -1;
console.log(
  `ShadowQA: ${composition.durationInFrames} frames @ ${composition.fps}fps (${(composition.durationInFrames / composition.fps / 60).toFixed(1)} min) → ${output}`,
);
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  crf: 17,
  outputLocation: output,
  imageFormat: "jpeg",
  jpegQuality: 95,
  concurrency: 4,
  chromiumOptions: { gl: "angle" },
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct >= last + 5) {
      last = pct;
      process.stdout.write(`  ${pct}%\n`);
    }
  },
});
console.log("done " + output);
