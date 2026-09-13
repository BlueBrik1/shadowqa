import chokidar from "chokidar";
import { mkdir, mkdtemp, readFile, writeFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Project } from "../core/contracts.js";
import { contained, excluded, hash, sanitize } from "../core/security.js";
import { Sandbox } from "./sandbox.js";
import { git } from "./process.js";

export type WatchEvent =
  | { kind: "snapshot"; digest: string; stale: boolean }
  | { kind: "result"; id: string; exitCode: number; output: string }
  | { kind: "error"; message: string }
  | { kind: "started"; root: string };

/**
 * Team edition's saved-file watcher: debounced, snapshot-isolated, checked in the same
 * network-disabled Docker sandbox as a real job — distinct from the individual edition's
 * `individual/core/qa.ts` watcher, which runs checks directly under the developer's own
 * permissions instead of a container.
 */
export async function watchSavedFiles(
  project: Project,
  folder: string,
  onEvent: (event: WatchEvent) => void,
) {
  const root = await realpath(folder);
  const sandbox = new Sandbox(`shadowqa-watch-${hash(root).slice(0, 12)}`, project.profile);
  await sandbox.doctor();
  let timer: ReturnType<typeof setTimeout> | undefined,
    running = false,
    generation = 0,
    closed = false;
  const controller = new AbortController();
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (p) => excluded(path.relative(root, p).replaceAll("\\", "/")),
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
  });
  const scan = async () => {
    if (running || closed) return;
    running = true;
    const version = generation;
    try {
      const snapshot = await mkdtemp(path.join(tmpdir(), "shadowqa-saved-"));
      const files = (
        await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
      )
        .split("\0")
        .filter((p) => p && !excluded(p));
      let bytes = 0;
      const hashes: Record<string, string> = {};
      for (const file of files) {
        const source = await contained(root, file);
        let s;
        try {
          s = await lstat(source);
        } catch {
          continue;
        }
        if (!s.isFile() || s.size > 1_000_000) continue;
        bytes += s.size;
        if (bytes > 30_000_000) throw new Error("Saved snapshot exceeds 30 MB");
        const content = await readFile(source);
        hashes[file] = hash(content.toString("base64"));
        const target = await contained(snapshot, file);
        await mkdir(path.dirname(target), { recursive: true, mode: 0o777 });
        await writeFile(target, content, { mode: 0o666 });
      }
      await git(snapshot, ["init", "--quiet"]);
      await git(snapshot, ["config", "core.autocrlf", "false"]);
      const digest = hash(hashes);
      const results = await sandbox.checks(snapshot, controller.signal);
      let stale = version !== generation;
      for (const [file, fileDigest] of Object.entries(hashes)) {
        try {
          if (hash((await readFile(await contained(root, file))).toString("base64")) !== fileDigest)
            stale = true;
        } catch {
          stale = true;
        }
      }
      onEvent({ kind: "snapshot", digest: digest.slice(0, 12), stale });
      for (const result of results)
        onEvent({ kind: "result", id: result.id, exitCode: result.exitCode, output: sanitize(result.output) });
      await mkdir(path.join(root, ".shadowqa"), { recursive: true });
      await writeFile(
        path.join(root, ".shadowqa", "diagnostics.json"),
        JSON.stringify({ projectId: project.id, snapshot: digest, stale, results, time: new Date().toISOString() }, null, 2),
      );
    } catch (e) {
      onEvent({ kind: "error", message: String(e) });
    } finally {
      running = false;
      if (generation !== version && !closed) timer = setTimeout(scan, 8000);
    }
  };
  watcher.on("all", (_event, file) => {
    if (file.includes(`${path.sep}.shadowqa${path.sep}`)) return;
    generation++;
    clearTimeout(timer);
    timer = setTimeout(scan, 8000);
  });
  onEvent({ kind: "started", root });
  await scan();
  return {
    async stop() {
      closed = true;
      controller.abort();
      clearTimeout(timer);
      await watcher.close();
      await sandbox.stop();
    },
  };
}
