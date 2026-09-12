// Renders every slide of the ShadowQA-Slides composition to a JPEG still and binds them into one
// PDF. No PDF library: a page is a JPEG XObject (DCTDecode) drawn full-bleed, which every viewer
// supports and keeps the deck at a few megabytes.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repo = path.resolve(root, "..");
const outDir = path.join(root, "out", "slides");
const pdfPath = process.argv[2] ?? path.join(repo, "deliverables", "shadowqa-slides.pdf");

await import("./extract.mjs");
await mkdir(outDir, { recursive: true });
await mkdir(path.dirname(pdfPath), { recursive: true });

console.log("bundling…");
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts") });
const composition = await selectComposition({ serveUrl, id: "ShadowQA-Slides", inputProps: {} });

const pages = [];
for (let frame = 0; frame < composition.durationInFrames; frame++) {
  const output = path.join(outDir, String(frame + 1).padStart(2, "0") + ".jpg");
  await renderStill({
    composition,
    serveUrl,
    output,
    frame,
    imageFormat: "jpeg",
    jpegQuality: 92,
    chromiumOptions: { gl: "angle" },
  });
  pages.push(output);
  console.log("  slide " + (frame + 1) + "/" + composition.durationInFrames);
}

// ---- minimal PDF writer --------------------------------------------------------------------
const W = composition.width, H = composition.height;
const objects = []; // strings or Buffers, 1-indexed by position
const add = (body) => (objects.push(body), objects.length);

const catalog = add(null); // placeholder, filled after pages exist
const pagesObj = add(null);
const pageIds = [];
for (const file of pages) {
  const jpg = await readFile(file);
  const image = add(
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
      ),
      jpg,
      Buffer.from("\nendstream"),
    ]),
  );
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  const contents = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const page = add(
    `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${contents} 0 R >>`,
  );
  pageIds.push(page);
}
objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => id + " 0 R").join(" ")}] /Count ${pageIds.length} >>`;
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
const info = add(
  `<< /Title (ShadowQA) /Author (ShadowQA) /Subject (Context-aware QA, from the first message to the running app) /Producer (video/scripts/slides.mjs) >>`,
);

const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
const offsets = [];
let position = chunks[0].length;
objects.forEach((body, i) => {
  offsets.push(position);
  const head = Buffer.from(`${i + 1} 0 obj\n`);
  const tail = Buffer.from(`\nendobj\n`);
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  chunks.push(head, payload, tail);
  position += head.length + payload.length + tail.length;
});
const xref = position;
const table = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
for (const o of offsets) table.push(String(o).padStart(10, "0") + " 00000 n \n");
chunks.push(
  Buffer.from(
    table.join("") +
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  ),
);
await writeFile(pdfPath, Buffer.concat(chunks));
console.log(`${pages.length} slides → ${pdfPath}`);
