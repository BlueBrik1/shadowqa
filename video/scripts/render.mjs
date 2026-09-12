// Renders every registered composition (or the ids passed as arguments) to out/.
import { bundle } from "@remotion/bundler";
import { renderMedia, getCompositions } from "@remotion/renderer";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const wanted = process.argv.slice(2);

await mkdir(path.join(root, "out"), { recursive: true });

console.log("bundling…");
const serveUrl = await bundle({
  entryPoint: path.join(root, "src", "index.ts"),
});
const all = await getCompositions(serveUrl);
const list = wanted.length ? all.filter((c) => wanted.includes(c.id)) : all;
if (!list.length)
  throw new Error(
    "No matching composition. Have: " + all.map((c) => c.id).join(", "),
  );

for (const composition of list) {
  const output = path.join(root, "out", composition.id.toLowerCase() + ".mp4");
  let last = -1;
  console.log(
    `${composition.id}: ${composition.durationInFrames} frames @ ${composition.fps}fps → ${output}`,
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
        process.stdout.write(`  ${composition.id} ${pct}%\n`);
      }
    },
  });
  console.log("  done " + output);
}
