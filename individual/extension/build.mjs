// Bundles the MV3 extension into individual/extension/dist, ready to load unpacked.
// Content scripts cannot use ES module imports, so every entry is bundled to one file.
import { build } from "esbuild";
import { mkdir, copyFile, writeFile, rm, readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const watch = process.argv.includes("--watch");

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "icons"), { recursive: true });

const common = {
  bundle: true,
  format: "esm",
  target: "chrome116",
  platform: "browser",
  legalComments: "none",
  logLevel: "info",
  sourcemap: false,
  minify: false,
};

await build({
  ...common,
  entryPoints: {
    background: path.join(here, "src/background/service-worker.ts"),
  },
  outdir: dist,
});

await build({
  ...common,
  // A content script is injected as a classic script; IIFE keeps it self-contained.
  format: "iife",
  entryPoints: { content: path.join(here, "src/content/index.ts") },
  outdir: dist,
});

await build({
  ...common,
  entryPoints: { panel: path.join(here, "src/sidepanel/panel.ts") },
  outdir: dist,
});

await copyFile(
  path.join(here, "manifest.json"),
  path.join(dist, "manifest.json"),
);
await copyFile(
  path.join(here, "src/sidepanel/index.html"),
  path.join(dist, "sidepanel.html"),
);
await copyFile(
  path.join(here, "src/sidepanel/panel.css"),
  path.join(dist, "panel.css"),
);

// ---------------------------------------------------------------------------
// Icons: the ShadowQA diamond, drawn as a charcoal square with an off-white mark so the
// extension reads the same way in a light or dark Chrome toolbar. The two values are the
// brand palette from src/cli/ui.ts (#1C1C1C and #F4F1EA).
// ---------------------------------------------------------------------------
const CHARCOAL = [0x1c, 0x1c, 0x1c];
const OFFWHITE = [0xf4, 0xf1, 0xea];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const centre = (size - 1) / 2;
  const outer = size * 0.46;
  const inner = size * 0.2;
  const stroke = Math.max(1, size * 0.055);
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0); // no filter
    for (let x = 0; x < size; x++) {
      const d = Math.abs(x - centre) + Math.abs(y - centre); // diamond distance
      const onOutline = Math.abs(d - outer) <= stroke / 2;
      const inInner = d <= inner;
      const [r, g, b] = onOutline || inInner ? OFFWHITE : CHARCOAL;
      raw.push(r, g, b, 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128])
  await writeFile(path.join(dist, "icons", `${size}.png`), png(size));

const manifest = JSON.parse(
  await readFile(path.join(dist, "manifest.json"), "utf8"),
);
console.log(
  `built ${manifest.name} ${manifest.version} → ${dist}\n` +
    "load it with chrome://extensions → Developer mode → Load unpacked",
);

if (watch)
  console.log("(--watch is not implemented; re-run the build after changes)");
