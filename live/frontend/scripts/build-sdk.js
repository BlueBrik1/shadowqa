// Bundles the ShadowQA runtime SDK into a single self-contained script for the Chrome extension / <script> embedding.
const path = require("path");
const esbuild = require("esbuild");

const outfile = path.resolve(__dirname, "../../extension/shadowqa.js");
esbuild
  .build({
    entryPoints: [path.resolve(__dirname, "../src/shadowqa/standalone.js")],
    bundle: true,
    minify: false,
    format: "iife",
    target: ["chrome110"],
    outfile,
    banner: { js: "/* ShadowQA runtime SDK — built from frontend/src/shadowqa */" },
    logLevel: "info",
  })
  .then(() => console.log(`SDK bundle written to ${outfile}`))
  .catch(() => process.exit(1));
