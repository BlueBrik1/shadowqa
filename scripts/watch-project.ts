#!/usr/bin/env node
/**
 * Foreground saved-file watcher for one team project, run from the VS Code extension's integrated
 * terminal (`shadowqa.watch` command) — the same isolated, Docker-sandboxed checks a real job
 * uses, on every save. `--url`/`--token` point at the already-running ShadowQA service; nothing
 * here talks to `.env` or opens its own port.
 */
import { watchSavedFiles } from "../src/runner/watch.js";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing --${name}`);
  return process.argv[i + 1];
}

const url = arg("url"),
  token = arg("token"),
  projectId = arg("project"),
  folder = arg("folder");

const response = await fetch(`${url}/projects`, { headers: { authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`Could not load projects: HTTP ${response.status}`);
const project = (await response.json()).find((p: any) => p.id === projectId);
if (!project) throw new Error(`No such project: ${projectId}`);

console.log(`Watching saved files in ${folder}. Checks run after 8 seconds of inactivity. Ctrl+C stops.`);
const handle = await watchSavedFiles(project, folder, (event) => {
  if (event.kind === "snapshot") console.log(`SNAPSHOT ${event.digest}${event.stale ? " (stale)" : ""}`);
  else if (event.kind === "result") console.log(`${event.exitCode === 0 ? "PASS" : "FINDING"} ${event.id}`);
  else if (event.kind === "error") console.error("SCAN ERROR", event.message);
});
process.once("SIGINT", () => void handle.stop().then(() => process.exit(0)));
process.once("SIGTERM", () => void handle.stop().then(() => process.exit(0)));
