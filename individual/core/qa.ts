import chokidar from "chokidar";
import { mkdir, mkdtemp, readFile, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { QA, classify, type Finding } from "../../src/qa/findings.js";
import { git } from "../../src/runner/process.js";
import {
  contained,
  excluded,
  hash,
  sanitize,
  AppError,
} from "../../src/core/security.js";
import type { CheckResult } from "../../src/core/contracts.js";
import { exportTree } from "../../src/runner/workspace.js";
import { runChecks, workRoot, type Check } from "./execute.js";
import type { IndividualProject } from "./contracts.js";
import type { Store } from "./store.js";

export type Trigger =
  | "saved-files"
  | "agent-changes"
  | "scheduled"
  | "ci"
  | "manual";

const toCheckResult = (check: Check): CheckResult => ({
  id: check.id,
  exitCode: check.exitCode,
  output: check.output,
  durationMs: check.durationMs,
  timedOut: check.timedOut,
});

/**
 * Records findings from a set of check results. The supervisor always runs the checks itself,
 * so a finding never depends on the coding agent's own report.
 */
export async function record(
  store: Store,
  project: IndividualProject,
  sha: string,
  checks: Check[],
  trigger: Trigger,
  baseline: Check[] = [],
  repeated = false,
) {
  const qa = new QA(store.db);
  const findings = await qa.record(
    store.tenant,
    project.id,
    sha,
    checks.map(toCheckResult),
    baseline.map(toCheckResult),
    repeated,
  );
  await store.db.audit(store.tenant, "owner", "qa.record", project.id, {
    trigger,
    sha,
    findings: findings.length,
  });
  return findings.map((f) => ({ ...f, trigger }));
}

export async function findings(store: Store, projectId?: string) {
  return store.db.list<Finding>(store.tenant, "finding", projectId);
}

export async function finding(store: Store, id: string) {
  const found = await store.db.get<Finding>(store.tenant, "finding", id);
  if (!found) throw new AppError("NO_FINDING", "Unknown finding", 404);
  return found;
}

/** Records a repair attempt so the loop cannot retry forever. */
export async function noteRepairAttempt(store: Store, id: string) {
  const current = await finding(store, id);
  const next: Finding = {
    ...current,
    repairAttempts: current.repairAttempts + 1,
    lastRepair: new Date().toISOString(),
  };
  await store.db.put(store.tenant, "finding", id, next, current.projectId);
  return next;
}

export function repairAllowed(project: IndividualProject, found: Finding) {
  if (found.state === "suppressed")
    return { ok: false, reason: "Finding is suppressed." };
  if (found.classification === "environment")
    return { ok: false, reason: "Environment failure, not a code defect." };
  if (found.classification === "flaky")
    return { ok: false, reason: "Classified flaky; repeated runs disagree." };
  if (found.repairAttempts >= project.repairAttempts)
    return {
      ok: false,
      reason: `Already attempted ${found.repairAttempts} repair(s); the cap is ${project.repairAttempts}.`,
    };
  return { ok: true, reason: "" };
}

/** Runs the project's checks against a clean copy of HEAD. Used for scans and baselines. */
export async function scanHead(
  project: IndividualProject,
  signal?: AbortSignal,
) {
  if (!project.repo?.path)
    throw new AppError("NO_REPO", "Project has no repository");
  const repo = await realpath(path.resolve(project.repo.path));
  const sha = (await git(repo, ["rev-parse", "HEAD"])).trim();
  const dir = path.join(
    workRoot(),
    "scan",
    `${project.id}-${sha.slice(0, 8)}-${Date.now()}`,
  );
  await mkdir(path.dirname(dir), { recursive: true });
  await exportTree(repo, sha, dir);
  const checks = await runChecks(project, dir, signal);
  return { sha, dir, checks };
}

export type WatchHandle = {
  stop: () => Promise<void>;
  scanNow: () => Promise<void>;
};

/**
 * Observes saved files in the developer's own folder. Files are copied into a snapshot and the
 * checks run there; the original folder is read, never executed in place and never modified.
 */
export async function watchSavedFiles(
  store: Store,
  project: IndividualProject,
  onResult: (info: {
    snapshot: string;
    stale: boolean;
    checks: Check[];
    findings: Finding[];
  }) => void,
  debounceMs = 8000,
): Promise<WatchHandle> {
  if (!project.repo?.path)
    throw new AppError("NO_REPO", "Project has no repository");
  const root = await realpath(path.resolve(project.repo.path));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let generation = 0;
  let closed = false;
  let baseline: Check[] = [];

  const scan = async () => {
    if (running || closed) return;
    running = true;
    const version = generation;
    try {
      const snapshot = await mkdtemp(
        path.join(tmpdir(), "shadowqa-individual-saved-"),
      );
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
        let stat;
        try {
          stat = await lstat(source);
        } catch {
          continue;
        }
        if (!stat.isFile() || stat.size > 1_000_000) continue;
        bytes += stat.size;
        if (bytes > 30_000_000)
          throw new AppError("SNAPSHOT_CAP", "Saved snapshot exceeds 30 MB");
        const content = await readFile(source);
        hashes[file] = hash(content.toString("base64"));
        const target = await contained(snapshot, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
      }
      await git(snapshot, ["init", "--quiet"]);
      await git(snapshot, ["config", "core.autocrlf", "false"]);
      const digest = hash(hashes);
      const checks = await runChecks(project, snapshot, controller.signal);

      // A result is stale if anything changed on disk while the checks were running.
      let stale = version !== generation;
      for (const [file, expected] of Object.entries(hashes)) {
        try {
          const now = hash(
            (await readFile(await contained(root, file))).toString("base64"),
          );
          if (now !== expected) stale = true;
        } catch {
          stale = true;
        }
      }
      const recorded = stale
        ? []
        : await record(
            store,
            project,
            digest.slice(0, 40).padEnd(40, "0"),
            checks,
            "saved-files",
            baseline,
          );
      if (!stale && checks.every((c) => c.exitCode === 0)) baseline = checks;
      onResult({
        snapshot: digest.slice(0, 12),
        stale,
        checks,
        findings: recorded,
      });
    } catch (e) {
      onResult({ snapshot: "", stale: true, checks: [], findings: [] });
      await store.db.audit(
        store.tenant,
        "owner",
        "qa.watch.error",
        project.id,
        {
          error: sanitize(String(e)).slice(0, 400),
        },
      );
    } finally {
      running = false;
      if (generation !== version && !closed)
        timer = setTimeout(() => void scan(), debounceMs);
    }
  };

  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (p: string) =>
      excluded(path.relative(root, p).replaceAll("\\", "/")),
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
  });
  watcher.on("all", () => {
    generation++;
    clearTimeout(timer);
    timer = setTimeout(() => void scan(), debounceMs);
  });

  return {
    scanNow: scan,
    stop: async () => {
      closed = true;
      controller.abort();
      clearTimeout(timer);
      await watcher.close();
    },
  };
}

export { classify };
export type { Finding };
