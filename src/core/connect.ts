import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";
import path from "node:path";
import { WebClient } from "@slack/web-api";
import { AppError, sanitize } from "./security.js";
import { git } from "../runner/process.js";

/**
 * Connection verification for Slack and GitHub, shared by every interface (desktop app, video
 * build). Deliberately has no terminal/console dependency — callers decide how to present it.
 */

export async function verifySlack(botToken = "", appToken = "") {
  if (!botToken)
    throw new AppError(
      "SLACK_TOKEN",
      "A bot token is required; nothing was entered",
    );
  if (!botToken.startsWith("xoxb-"))
    throw new AppError("SLACK_TOKEN", "Bot token must begin with xoxb-");
  if (appToken && !appToken.startsWith("xapp-"))
    throw new AppError("SLACK_TOKEN", "App-level token must begin with xapp-");
  const auth: any = await new WebClient(botToken).auth.test();
  if (!auth.ok)
    throw new AppError("SLACK_AUTH", "Slack rejected the bot token");
  return {
    team: String(auth.team_id ?? ""),
    user: String(auth.user ?? ""),
    url: String(auth.url ?? ""),
  };
}

/** Lists only channels the bot actually joined; ShadowQA never observes a channel it was not invited to. */
export async function slackChannels(botToken: string) {
  const web = new WebClient(botToken);
  const out: { id: string; name: string; private: boolean }[] = [];
  let cursor: string | undefined;
  do {
    const page: any = await web.conversations.list({
      exclude_archived: true,
      limit: 200,
      types: "public_channel,private_channel",
      cursor,
    });
    for (const c of page.channels ?? [])
      if (c.is_member)
        out.push({ id: c.id, name: c.name, private: !!c.is_private });
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor && out.length < 400);
  return out;
}

function appJwt(appId: string, key: Buffer) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned =
    encode({ alg: "RS256", typ: "JWT" }) +
    "." +
    encode({ iat: now - 60, exp: now + 540, iss: appId });
  return (
    unsigned +
    "." +
    createSign("RSA-SHA256").update(unsigned).sign(key, "base64url")
  );
}

/** Exchanges a GitHub App Manifest conversion code for the app's id, PEM key and webhook secret. No manual copy-paste. */
export async function convertManifest(
  code: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(
    `https://api.github.com/app-manifests/${code}/conversions`,
    {
      method: "POST",
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new AppError(
      "GITHUB_MANIFEST",
      `GitHub rejected the manifest conversion (${response.status})`,
    );
  const app: any = await response.json();
  return {
    appId: String(app.id),
    slug: String(app.slug ?? app.name ?? app.id),
    privateKey: String(app.pem),
    webhookSecret: String(app.webhook_secret ?? ""),
    clientId: String(app.client_id ?? ""),
    clientSecret: String(app.client_secret ?? ""),
    htmlUrl: String(app.html_url ?? ""),
  };
}

export async function verifyGithub(
  appId: string,
  key: string | Buffer,
  fetcher: typeof fetch = fetch,
) {
  const pem = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const jwt = appJwt(appId, pem);
  const headers = {
    authorization: "Bearer " + jwt,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  const app = await fetcher("https://api.github.com/app", {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!app.ok)
    throw new AppError(
      "GITHUB_AUTH",
      `GitHub rejected the App credentials (${app.status})`,
    );
  const identity: any = await app.json();
  const list = await fetcher(
    "https://api.github.com/app/installations?per_page=100",
    { headers, signal: AbortSignal.timeout(30_000) },
  );
  if (!list.ok)
    throw new AppError(
      "GITHUB_AUTH",
      `Cannot read installations (${list.status})`,
    );
  const installations: any[] = await list.json();
  return {
    slug: String(identity.slug ?? identity.name ?? appId),
    jwt,
    installations,
  };
}

/** Same as {@link verifyGithub}, but reads the PEM from a file path (the pre-manifest-flow path). */
export async function verifyGithubKeyFile(
  appId: string,
  keyPath: string,
  fetcher: typeof fetch = fetch,
) {
  return verifyGithub(appId, await readFile(path.resolve(keyPath)), fetcher);
}

export async function githubRepositories(
  jwt: string,
  installationId: number,
  fetcher: typeof fetch = fetch,
) {
  const headers = {
    authorization: "Bearer " + jwt,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  const tokenResponse = await fetcher(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        permissions: {
          contents: "read",
          metadata: "read",
          pull_requests: "read",
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!tokenResponse.ok)
    throw new AppError(
      "GITHUB_AUTH",
      `Installation authorization failed (${tokenResponse.status})`,
    );
  const { token } = (await tokenResponse.json()) as any;
  const repos = await fetcher(
    "https://api.github.com/installation/repositories?per_page=100",
    {
      headers: { ...headers, authorization: "Bearer " + token },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!repos.ok)
    throw new AppError(
      "GITHUB_AUTH",
      `Cannot read repositories (${repos.status})`,
    );
  const body: any = await repos.json();
  return (body.repositories ?? []).map((r: any) => ({
    githubId: r.id as number,
    owner: String(r.owner?.login ?? ""),
    name: String(r.name ?? ""),
    defaultBranch: String(r.default_branch ?? "main"),
    visibility: r.private ? ("private" as const) : ("public" as const),
  }));
}

/** Confirms the folder is the root of a clone of the selected repository before it becomes a planning source. */
export async function verifyClone(folder: string, owner: string, name: string) {
  const repo = path.resolve(folder);
  const root = (await git(repo, ["rev-parse", "--show-toplevel"])).trim();
  if (path.resolve(root).toLowerCase() !== repo.toLowerCase())
    throw new AppError("REPO_MAPPING", "Choose the repository root folder");
  const remote = (await git(repo, ["remote", "get-url", "origin"])).trim();
  const match = remote.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^\s]+?)(?:\.git)?$/,
  );
  if (!match || match[1].toLowerCase() !== `${owner}/${name}`.toLowerCase())
    throw new AppError(
      "REPO_MAPPING",
      `origin is ${sanitize(remote)}; expected ${owner}/${name}`,
    );
  return repo;
}

export const MODE_HELP: Record<string, string> = {
  observe: "Watch and check only. ShadowQA never edits or publishes.",
  approval: "Ask first. Every plan and every repair waits for you.",
  "auto-fix":
    "Bounded automatic repair inside configured automatic paths; humans still merge.",
  "full-auto":
    "Same bounded scope plus policy-gated merging. Requires an explicit merge policy.",
};

export function defaultProfile() {
  return {
    id: "node-v1",
    image: "shadowqa-sandbox:1.15.10",
    checks: [
      { id: "test", argv: ["npm", "test"], timeoutSeconds: 600 },
      {
        id: "typecheck",
        argv: ["npm", "run", "typecheck"],
        timeoutSeconds: 600,
      },
    ],
    install: [],
    allowedPaths: ["src/", "tests/", "docs/"],
    protectedPaths: [".github/", "package.json", "package-lock.json", ".env"],
    autoPaths: ["docs/"],
    requiredChecks: ["test"],
    reviewed: false,
    externalInferenceApproved: false,
  };
}
