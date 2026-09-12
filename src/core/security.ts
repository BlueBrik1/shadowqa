import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { realpath, lstat } from "node:fs/promises";
import type { Principal } from "./contracts.js";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const token = () => randomBytes(32).toString("base64url");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : canonical(value))
    .digest("hex");
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function githubSignature(
  raw: string,
  signature: string,
  secret: string,
) {
  return (
    !!secret &&
    equal(
      "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"),
      signature,
    )
  );
}
export function slackSignature(
  raw: string,
  signature: string,
  timestamp: string,
  secret: string,
  now = Date.now(),
) {
  return (
    !!secret &&
    /^\d+$/.test(timestamp) &&
    Math.abs(now / 1000 - Number(timestamp)) <= 300 &&
    equal(
      "v0=" +
        createHmac("sha256", secret)
          .update(`v0:${timestamp}:${raw}`)
          .digest("hex"),
      signature,
    )
  );
}
export function sanitize(text: string): string {
  return text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(?:AIza[\w-]{30,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|xox[baprs]-[\w-]{10,}|xapp-[\w-]{20,}|npm_[\w]{20,}|AKIA[A-Z0-9]{16}|sk-[\w-]{20,})\b/g,
      "[REDACTED TOKEN]",
    )
    .replace(
      /((?:api[_-]?key|password|secret|authorization|access[_-]?token|_authToken)\s*[=:]\s*["']?)[^\s"',;]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
export function safeRelative(p: string): boolean {
  return (
    !!p &&
    !p.includes("\\") &&
    !p.includes(":") &&
    !p.includes("\0") &&
    !p.startsWith("/") &&
    p.split("/").every((s) => s !== "." && s !== ".." && s !== "")
  );
}
export function inPaths(file: string, paths: string[]) {
  return paths.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));
}
export function excluded(file: string) {
  return /(^|\/)(\.git|node_modules|dist|coverage|\.shadowqa|\.env[^/]*|\.ssh|\.aws|\.opencode|\.npmrc|\.netrc|\.pypirc|\.git-credentials|id_rsa|id_ed25519)(\/|$)|\.(pem|key|p12|pfx)$|(^|\/)opencode\.jsonc?$/.test(
    file,
  );
}
export async function contained(root: string, relative: string) {
  if (!safeRelative(relative))
    throw new AppError("PATH_ESCAPE", "Invalid repository-relative path");
  const base = await realpath(root),
    target = path.resolve(base, relative),
    rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new AppError("PATH_ESCAPE", "Path leaves repository");
  let current = base;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new AppError(
          "SYMLINK",
          "Symlinks are not eligible for execution or indexing",
        );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return target;
}
export function authorize(
  actor: Principal,
  project?: string,
  roles: Principal["role"][] = ["admin", "developer", "viewer"],
) {
  if (
    !roles.includes(actor.role) ||
    (project && actor.role !== "admin" && !actor.projects.includes(project))
  )
    throw new AppError("FORBIDDEN", "Access denied", 403);
}
export function requireTransport(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" &&
    !(
      u.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
    )
  )
    throw new AppError("TRANSPORT", "Remote coordination requires HTTPS");
}
