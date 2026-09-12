import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Resolving a CLI name to something spawnable without a shell.
 *
 * Node refuses to spawn `.cmd` and `.bat` files when `shell` is false, and ShadowQA never uses a
 * shell: every command is an argument array so nothing the model or a config file produces can be
 * re-parsed as shell syntax. On Windows that means the npm shim has to be resolved to the real
 * target it launches — usually a native `.exe`, sometimes a `.js` that needs Node.
 */
export type Resolved = {
  /** Executable to spawn. */
  command: string;
  /** Arguments that must precede the caller's own, e.g. the script path for a Node CLI. */
  prefix: string[];
  /** How it was found, for diagnostics. */
  via: "override" | "path" | "shim" | "node-script" | "name";
};

const cache = new Map<string, Resolved>();

const exists = (file: string) =>
  access(file)
    .then(() => true)
    .catch(() => false);

const envKey = (name: string) =>
  "SHADOWQA_" + name.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_EXE";

/** Pulls the real target out of an npm-generated .cmd shim. */
export function shimTarget(script: string): string | undefined {
  const quoted = [...script.matchAll(/"%dp0%\\([^"]+)"/g)].map((m) => m[1]);
  const candidates = quoted.filter((value) => !/(^|\\)node\.exe$/i.test(value));
  return candidates.at(-1);
}

export async function resolveExecutable(name: string): Promise<Resolved> {
  const cached = cache.get(name);
  if (cached) return cached;

  const override = process.env[envKey(name)];
  if (override) {
    const resolved: Resolved = {
      command: override,
      prefix: [],
      via: "override",
    };
    cache.set(name, resolved);
    return resolved;
  }

  if (process.platform !== "win32") {
    const resolved: Resolved = { command: name, prefix: [], via: "name" };
    cache.set(name, resolved);
    return resolved;
  }

  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  let resolved: Resolved | undefined;

  // A native executable on PATH can be spawned directly.
  for (const dir of dirs) {
    for (const extension of [".exe", ".com"]) {
      const file = path.join(dir, name + extension);
      if (await exists(file)) {
        resolved = { command: file, prefix: [], via: "path" };
        break;
      }
    }
    if (resolved) break;
  }

  // Otherwise follow the npm shim to whatever it actually launches.
  if (!resolved)
    for (const dir of dirs) {
      for (const extension of [".cmd", ".bat"]) {
        const shim = path.join(dir, name + extension);
        if (!(await exists(shim))) continue;
        const target = shimTarget(await readFile(shim, "utf8").catch(() => ""));
        if (!target) continue;
        const full = path.resolve(dir, target);
        if (!(await exists(full))) continue;
        resolved = /\.(c|m)?js$/i.test(full)
          ? { command: process.execPath, prefix: [full], via: "node-script" }
          : { command: full, prefix: [], via: "shim" };
        break;
      }
      if (resolved) break;
    }

  resolved ??= { command: name, prefix: [], via: "name" };
  cache.set(name, resolved);
  return resolved;
}

/** Test seam: clears the resolution cache. */
export function forgetExecutables() {
  cache.clear();
}

/**
 * Some Windows installs nest the real binary inside a platform package. This looks one level
 * deeper when the shim was not found, which is how OpenCode ships on Windows.
 */
export async function findNested(packageName: string, binary: string) {
  const base = path.join(process.env.APPDATA ?? "", "npm", "node_modules");
  for (const candidate of [
    path.join(base, packageName, "bin", binary),
    path.join(base, packageName, "node_modules"),
  ]) {
    if (await exists(candidate)) {
      if (candidate.endsWith("node_modules")) {
        for (const entry of await readdir(candidate).catch(() => [])) {
          const nested = path.join(candidate, entry, "bin", binary);
          if (await exists(nested)) return nested;
        }
        continue;
      }
      return candidate;
    }
  }
  return undefined;
}
