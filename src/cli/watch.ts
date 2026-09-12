import chokidar from "chokidar";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Project } from "../core/contracts.js";
import { contained, excluded, hash, sanitize } from "../core/security.js";
import { Sandbox } from "../runner/sandbox.js";
import { git } from "../runner/process.js";
import { line, success } from "./ui.js";
export async function watch(project: Project, folder: string) {
  const root = await realpath(folder);
  const sandbox = new Sandbox(
    `shadowqa-watch-${hash(root).slice(0, 12)}`,
    project.profile,
  );
  await sandbox.doctor();
  let timer: ReturnType<typeof setTimeout> | undefined,
    running = false,
    generation = 0,
    closed = false;
  const controller = new AbortController();
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (p) => {
      const rel = path.relative(root, p).replaceAll("\\", "/");
      return excluded(rel);
    },
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
  });
  const scan = async () => {
    if (running || closed) return;
    running = true;
    const version = generation;
    try {
      const snapshot = await mkdtemp(path.join(tmpdir(), "shadowqa-saved-"));
      // Enumerate tracked + nonignored saved files. Copy bytes, never execute the original folder.
      const files = (
        await git(root, [
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
        ])
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
      for (const [file, digest] of Object.entries(hashes)) {
        try {
          if (
            hash(
              (await readFile(await contained(root, file))).toString("base64"),
            ) !== digest
          )
            stale = true;
        } catch {
          stale = true;
        }
      }
      line(stale ? "STALE SNAPSHOT" : "SAVED SNAPSHOT", digest.slice(0, 12));
      for (const result of results) {
        line(result.exitCode === 0 ? "PASS" : "FINDING", result.id);
        if (result.exitCode !== 0) console.log(sanitize(result.output));
      }
      const report = {
        projectId: project.id,
        snapshot: digest,
        stale,
        results,
        time: new Date().toISOString(),
      };
      await mkdir(path.join(root, ".shadowqa"), { recursive: true });
      await writeFile(
        path.join(root, ".shadowqa", "diagnostics.json"),
        JSON.stringify(report, null, 2),
      );
    } catch (e) {
      line("SCAN ERROR", String(e));
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
  const stop = async () => {
    closed = true;
    controller.abort();
    clearTimeout(timer);
    await watcher.close();
    await sandbox.stop();
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  success(
    `Watching saved files in ${root}. Checks run after 8 seconds of inactivity. Ctrl+C stops.`,
  );
  await scan();
}
