import { describe, expect, test } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  mergeEnv,
  missingProjectSteps,
  verifySlack,
  verifyGithub,
  githubRepositories,
  verifyClone,
  MODE_HELP,
  STEPS,
} from "../src/cli/setup.js";
import { Mode } from "../src/core/contracts.js";
import { git, run } from "../src/runner/process.js";

describe("environment merging", () => {
  test("known keys are rewritten in place and comments survive", () => {
    const before = [
      "# Copy to .env",
      "DATABASE_URL=postgresql://old",
      "",
      "# Slack",
      "SLACK_BOT_TOKEN=",
      "GEMINI_MODEL=gemini-2.5-flash",
    ].join("\n");
    const after = mergeEnv(before, {
      SLACK_BOT_TOKEN: "xoxb-new",
      GITHUB_APP_ID: "123456",
    });
    expect(after).toContain("# Copy to .env");
    expect(after).toContain("# Slack");
    expect(after).toContain("DATABASE_URL=postgresql://old");
    expect(after).toContain("SLACK_BOT_TOKEN=xoxb-new");
    expect(after).toContain("GEMINI_MODEL=gemini-2.5-flash");
    // An unknown key is appended rather than dropped.
    expect(after.trimEnd().endsWith("GITHUB_APP_ID=123456")).toBe(true);
    // A key is never duplicated.
    expect(after.match(/SLACK_BOT_TOKEN=/g)).toHaveLength(1);
  });

  test("a value containing '=' is preserved whole", () => {
    expect(mergeEnv("KEY=old", { KEY: "a=b=c" })).toContain("KEY=a=b=c");
  });
});

describe("partial setup", () => {
  test("running one step names the steps still required instead of failing a schema", () => {
    expect(missingProjectSteps({})).toEqual(["github", "mode", "project"]);
    expect(missingProjectSteps({ repository: { githubId: 1 } })).toEqual([
      "mode",
      "project",
    ]);
    expect(
      missingProjectSteps({
        repository: { githubId: 1 },
        policy: { mode: "approval" },
        id: "p",
        profile: {},
      }),
    ).toEqual([]);
  });

  test("every documented mode is a real mode in the contract", () => {
    for (const mode of Object.keys(MODE_HELP))
      expect(() => Mode.parse(mode)).not.toThrow();
    expect(Object.keys(MODE_HELP)).toHaveLength(Mode.options.length);
  });

  test("the step list matches what the CLI offers", () => {
    expect([...STEPS]).toEqual(["slack", "github", "mode", "project"]);
  });
});

describe("live verification", () => {
  test("an empty or malformed Slack token is rejected before any network call", async () => {
    await expect(verifySlack("", "")).rejects.toThrow(/required/);
    await expect(verifySlack("nope", "")).rejects.toThrow(/xoxb-/);
    await expect(verifySlack("xoxb-ok", "bad")).rejects.toThrow(/xapp-/);
  });

  test("GitHub App credentials that are refused produce a clear error", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shadowqa-key-"));
    const key = path.join(dir, "app.pem");
    // A real RSA key so the JWT is signed; the fetch is stubbed, so nothing leaves the machine.
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await writeFile(
      key,
      privateKey.export({ type: "pkcs1", format: "pem" }) as string,
    );
    const fetcher = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(verifyGithub("123", key, fetcher)).rejects.toThrow(
      /rejected the App credentials/,
    );
  });

  test("installation repositories are read through a scoped installation token", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string, init: any) => {
      calls.push(String(url));
      if (String(url).includes("access_tokens"))
        return new Response(JSON.stringify({ token: "ghs_scoped" }), {
          status: 201,
        });
      expect(init.headers.authorization).toBe("Bearer ghs_scoped");
      return new Response(
        JSON.stringify({
          repositories: [
            {
              id: 9,
              owner: { login: "acme" },
              name: "payments-ui",
              default_branch: "main",
              private: true,
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const repositories = await githubRepositories("jwt", 55, fetcher);
    expect(repositories).toEqual([
      {
        githubId: 9,
        owner: "acme",
        name: "payments-ui",
        defaultBranch: "main",
        visibility: "private",
      },
    ]);
    expect(calls[0]).toContain("/app/installations/55/access_tokens");
  });
});

describe("clone verification", () => {
  test("a clone whose origin does not match the chosen repository is refused", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shadowqa-clone-"));
    await run("git", ["init", "--quiet", dir], { timeoutMs: 30_000 });
    await git(dir, [
      "remote",
      "add",
      "origin",
      "https://github.com/someone/else.git",
    ]);
    await expect(verifyClone(dir, "acme", "payments-ui")).rejects.toThrow(
      /expected acme\/payments-ui/,
    );
    await git(dir, [
      "remote",
      "set-url",
      "origin",
      "git@github.com:acme/payments-ui.git",
    ]);
    await expect(verifyClone(dir, "acme", "payments-ui")).resolves.toBe(
      path.resolve(dir),
    );
  });

  test("a subdirectory of a clone is refused; only the root is accepted", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shadowqa-clone-sub-"));
    await run("git", ["init", "--quiet", dir], { timeoutMs: 30_000 });
    await git(dir, [
      "remote",
      "add",
      "origin",
      "https://github.com/acme/payments-ui",
    ]);
    const sub = path.join(dir, "src");
    await mkdir(sub, { recursive: true });
    await expect(verifyClone(sub, "acme", "payments-ui")).rejects.toThrow(
      /repository root/,
    );
  });
});
