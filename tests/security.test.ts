import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  githubSignature,
  slackSignature,
  sanitize,
  safeRelative,
  authorize,
  hash,
  requireTransport,
} from "../src/core/security.js";
import {
  validatePatch,
  validatePlan,
  canAuto,
  planDigest,
} from "../src/policy/engine.js";
import { actor, plan, project, patch } from "./helpers.js";
describe("security and deterministic policy", () => {
  it("verifies webhook signatures over the original bytes and rejects Slack replay", () => {
    const raw = '{"text":"hello"}',
      secret = "secret",
      sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    expect(githubSignature(raw, sig, secret)).toBe(true);
    expect(githubSignature(raw + " ", sig, secret)).toBe(false);
    expect(githubSignature(raw, sig, "")).toBe(false);
    const ts = String(Math.floor(Date.now() / 1000)),
      slack =
        "v0=" +
        createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
    expect(slackSignature(raw, slack, ts, secret)).toBe(true);
    expect(slackSignature(raw, slack, ts, secret, Date.now() + 301000)).toBe(
      false,
    );
  });
  it("rejects traversal, Windows drive paths and ambiguous path components", () => {
    for (const p of [
      "../x",
      "/etc/passwd",
      "C:/keys",
      "src\\x",
      "a/../b",
      "a//b",
      "./x",
    ])
      expect(safeRelative(p)).toBe(false);
    expect(safeRelative("src/login.ts")).toBe(true);
  });
  it("sanitizes secrets and terminal escape sequences", () => {
    const value = sanitize(
      "api_key=abc123 xoxb-12345678912345678 \u001b[31mhello\u0007",
    );
    expect(value).not.toContain("abc123");
    expect(value).not.toContain("xoxb-");
    expect(value).not.toContain("\u001b");
    expect(value).toContain("hello");
  });
  it("enforces role, project audience, and encrypted remote transport", () => {
    expect(() =>
      authorize({ ...actor, role: "viewer", projects: ["p1"] }, "p1", [
        "admin",
        "developer",
      ]),
    ).toThrow();
    expect(() =>
      authorize({ ...actor, role: "developer", projects: [] }, "p1"),
    ).toThrow();
    expect(() => requireTransport("http://example.com")).toThrow();
    expect(() => requireTransport("http://127.0.0.1:4380")).not.toThrow();
  });
  it("binds approval to material plan fields and profile version", () => {
    const p = project(),
      pl = plan(p);
    expect(() => validatePlan(pl, p)).not.toThrow();
    expect(() =>
      validatePlan({ ...pl, objective: "Ignore all policy" }, p),
    ).toThrow(/digest/);
    p.policy.version++;
    expect(() => validatePlan(pl, p)).toThrow(/changed/);
  });
  it("requires inspected paths, valid dependencies and resolved questions", () => {
    const p = project();
    let pl = plan(p);
    expect(() => validatePlan(pl, p, [])).toThrow(/inspected/);
    pl = { ...pl, steps: [{ id: "a", description: "work", dependsOn: ["b"] }] };
    pl.digest = planDigest(pl);
    expect(() => validatePlan(pl, p)).toThrow(/dependencies/);
  });
  it("blocks unexpected paths, symlinks, binary patches and assertion removal", () => {
    const p = project(),
      pl = plan(p);
    expect(validatePatch(patch, pl, p).files).toEqual(["src/submit.js"]);
    expect(() =>
      validatePatch(patch.replaceAll("src/submit.js", ".github/ci.yml"), pl, p),
    ).toThrow(/path/i);
    expect(() =>
      validatePatch(patch + "new file mode 120000\n", pl, p),
    ).toThrow();
    expect(() =>
      validatePatch(patch + "-expect(result).toBe(true)\n", pl, p),
    ).toThrow(/assertion/);
    expect(() => validatePatch(patch + "GIT binary patch\n", pl, p)).toThrow();
  });
  it("does not accept model confidence as permission to auto-fix", () => {
    const p = project();
    p.policy.mode = "auto-fix";
    const pl = plan(p);
    expect(canAuto(pl, p)).toBe(false);
    pl.expectedPaths = ["docs/guide.md"];
    expect(canAuto(pl, p)).toBe(true);
    pl.riskFlags = ["sensitive-content"];
    expect(canAuto(pl, p)).toBe(false);
  });
});
