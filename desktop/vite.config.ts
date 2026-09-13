import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, "renderer"),
  plugins: [react()],
  server: { port: 5183, strictPort: true },
  build: { outDir: path.join(here, "renderer", "dist"), emptyOutDir: true },
});
