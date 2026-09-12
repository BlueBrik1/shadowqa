import { readFile, writeFile, access } from "node:fs/promises";
import { createSign } from "node:crypto";
import path from "node:path";
import { WebClient } from "@slack/web-api";
import { Project, Mode } from "../core/contracts.js";
import { AppError, sanitize } from "../core/security.js";
import { git } from "../runner/process.js";
import { banner, line, success, failure, cyan } from "./ui.js";

export type Answer = (question: string) => Promise<string>;
export type Secret = (question: string) => Promise<string>;

/** Ordered guided flow: Slack, GitHub, mode, project. Each step verifies live before it is recorded. */
export const STEPS = ["slack", "github", "mode", "project"] as const;
export type Step = (typeof STEPS)[number];

export type SetupState = {
  env: Record<string, string>;
  project: Record<string, any>;
  completed: Step[];
};

const ENV_FILE = ".env";
const configFile = () => process.env.SHADOWQA_CONFIG ?? "shadowqa.config.json";

export async function readEnvFile(
  file = ENV_FILE,
): Promise<Record<string, string>> {
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    try {
      text = await readFile(".env.example", "utf8");
    } catch {
      text = "";
    }
  }
  const env: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

/** Rewrites known keys in place and appends unknown ones, so comments and unrelated settings survive. */
export function mergeEnv(existing: string, values: Record<string, string>) {
  const remaining = new Map(Object.entries(values));
  const lines = existing.split(/\r?\n/).map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return raw;
    const eq = trimmed.indexOf("=");
    if (eq < 1) return raw;
    const key = trimmed.slice(0, eq).trim();
    if (!remaining.has(key)) return raw;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return key + "=" + value;
  });
  for (const [key, value] of remaining) lines.push(key + "=" + value);
  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

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

export async function verifyGithub(
  appId: string,
  keyPath: string,
  fetcher: typeof fetch = fetch,
) {
  const key = await readFile(path.resolve(keyPath));
  const jwt = appJwt(appId, key);
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

function defaultProfile() {
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

export async function loadState(): Promise<SetupState> {
  const env = await readEnvFile();
  let project: Record<string, any> = {};
  try {
    const config = JSON.parse(await readFile(configFile(), "utf8"));
    project = config.projects?.[0] ?? {};
  } catch {}
  const completed: Step[] = [];
  if (env.SLACK_BOT_TOKEN) completed.push("slack");
  if (env.GITHUB_APP_ID && env.GITHUB_PRIVATE_KEY_PATH)
    completed.push("github");
  if (project.policy?.mode) completed.push("mode");
  if (project.id && project.repository?.githubId) completed.push("project");
  return { env, project, completed };
}

/**
 * Writes what the run actually produced. A single repeated step (`--step slack`) leaves the
 * project incomplete; the environment is still saved, and the caller is told which steps remain
 * rather than being shown a schema error.
 */
export async function writeState(state: SetupState) {
  let existing = "";
  try {
    existing = await readFile(ENV_FILE, "utf8");
  } catch {
    try {
      existing = await readFile(".env.example", "utf8");
    } catch {}
  }
  await writeFile(ENV_FILE, mergeEnv(existing, state.env), "utf8");

  const missing = missingProjectSteps(state.project);
  if (missing.length) return { env: ENV_FILE, config: undefined, missing };

  let config: any = { projects: [] };
  try {
    config = JSON.parse(await readFile(configFile(), "utf8"));
  } catch {}
  const parsed = Project.parse(state.project);
  config.projects = [
    parsed,
    ...(config.projects ?? []).filter((p: any) => p.id !== parsed.id),
  ];
  await writeFile(configFile(), JSON.stringify(config, null, 2) + "\n", "utf8");
  return { env: ENV_FILE, config: configFile(), missing: [] as Step[] };
}

/** Which setup steps still have to run before a complete project can be written. */
export function missingProjectSteps(project: Record<string, any>): Step[] {
  const missing: Step[] = [];
  if (!project?.repository?.githubId) missing.push("github");
  if (!project?.policy?.mode) missing.push("mode");
  if (!project?.id || !project?.profile) missing.push("project");
  return missing;
}

function step(index: number, title: string) {
  console.log("\n" + cyan(`  ${index}/4  ${title.toUpperCase()}`));
}

function choose<T>(items: T[], label: (item: T) => string) {
  items.forEach((item, i) =>
    console.log(`     ${String(i + 1).padStart(2)}  ${label(item)}`),
  );
}

export async function setup(ask: Answer, secret: Secret, only?: Step) {
  banner();
  const state = await loadState();
  const want = (name: Step) => !only || only === name;

  if (want("slack")) {
    step(1, "Slack");
    console.log(
      "     Socket Mode app with channels:history and chat:write. See infra/slack-manifest.json.\n",
    );
    const bot =
      (await secret("Bot token (xoxb-, hidden):")) || state.env.SLACK_BOT_TOKEN;
    const app =
      (await secret("App-level token (xapp-, hidden):")) ||
      state.env.SLACK_APP_TOKEN;
    const signing =
      (await secret("Signing secret (hidden):")) ||
      state.env.SLACK_SIGNING_SECRET;
    const identity = await verifySlack(bot, app);
    success(`Connected as ${identity.user} in ${identity.team}.`);
    state.env.SLACK_BOT_TOKEN = bot;
    state.env.SLACK_APP_TOKEN = app;
    state.env.SLACK_SIGNING_SECRET = signing;
    state.env.SLACK_TEAM_ID = identity.team;
    const channels = await slackChannels(bot);
    if (!channels.length)
      failure(
        "The bot is not in any channel yet. Invite it, then rerun shadowqa setup --step slack.",
      );
    else {
      line("CHANNELS", `${channels.length} joined`);
      choose(
        channels,
        (c) => `#${c.name}${c.private ? "  (private)" : ""}  ${c.id}`,
      );
      const picked = await ask("Numbers to observe, comma separated:");
      const selected = picked
        .split(",")
        .map((n) => channels[Number(n.trim()) - 1])
        .filter(Boolean);
      state.project.channels = selected.map((c) => ({
        id: c.id,
        private: c.private,
      }));
      for (const c of selected) line("OBSERVING", "#" + c.name);
    }
    if (!state.completed.includes("slack")) state.completed.push("slack");
  }

  if (want("github")) {
    step(2, "GitHub");
    console.log(
      "     A GitHub App you administer, installed on the repository ShadowQA may read.\n",
    );
    const appId =
      (await ask(
        `App ID${state.env.GITHUB_APP_ID ? ` [${state.env.GITHUB_APP_ID}]` : ""}:`,
      )) || state.env.GITHUB_APP_ID;
    const keyPath =
      (await ask(
        `Private key .pem path${state.env.GITHUB_PRIVATE_KEY_PATH ? ` [${state.env.GITHUB_PRIVATE_KEY_PATH}]` : ""}:`,
      )) || state.env.GITHUB_PRIVATE_KEY_PATH;
    if (!appId || !keyPath)
      throw new AppError(
        "GITHUB_SETUP",
        "App ID and private key path are required",
      );
    const app = await verifyGithub(appId, keyPath);
    success(`Authenticated as GitHub App ${app.slug}.`);
    state.env.GITHUB_APP_ID = appId;
    state.env.GITHUB_PRIVATE_KEY_PATH = path.resolve(keyPath);
    const webhook =
      (await secret("Webhook secret (hidden, Enter to keep):")) ||
      state.env.GITHUB_WEBHOOK_SECRET;
    if (webhook) state.env.GITHUB_WEBHOOK_SECRET = webhook;
    if (!app.installations.length)
      throw new AppError(
        "GITHUB_SETUP",
        "Install the App on a repository, then rerun shadowqa setup --step github",
      );
    choose(
      app.installations,
      (i: any) => `${i.account?.login ?? i.id}  installation ${i.id}`,
    );
    const installation =
      app.installations[Number((await ask("Installation number:")) || "1") - 1];
    if (!installation)
      throw new AppError("GITHUB_SETUP", "No such installation");
    const repositories = await githubRepositories(app.jwt, installation.id);
    if (!repositories.length)
      throw new AppError(
        "GITHUB_SETUP",
        "That installation grants no repositories",
      );
    choose(
      repositories,
      (r: any) => `${r.owner}/${r.name}  (${r.visibility}, ${r.defaultBranch})`,
    );
    const repo =
      repositories[Number((await ask("Repository number:")) || "1") - 1];
    if (!repo) throw new AppError("GITHUB_SETUP", "No such repository");
    const folder = await ask("Local clone folder for read-only planning:");
    const localPath = await verifyClone(folder, repo.owner, repo.name);
    state.project.repository = {
      id:
        state.project.repository?.id ??
        `${repo.owner}-${repo.name}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
      githubId: repo.githubId,
      owner: repo.owner,
      name: repo.name,
      installationId: installation.id,
      defaultBranch: repo.defaultBranch,
      visibility: repo.visibility,
      localPath,
    };
    success(`Repository ${repo.owner}/${repo.name} verified at ${localPath}.`);
    if (!state.completed.includes("github")) state.completed.push("github");
  }

  if (want("mode")) {
    step(3, "Mode");
    console.log("     How much should ShadowQA do on its own?\n");
    const modes = Object.keys(MODE_HELP);
    choose(modes, (m) => `${m.padEnd(10)} ${MODE_HELP[m]}`);
    const answer = (
      await ask(`Number or name [${state.project.policy?.mode ?? "approval"}]:`)
    ).trim();
    const mode = Mode.parse(
      /^\d+$/.test(answer)
        ? modes[Number(answer) - 1]
        : answer || state.project.policy?.mode || "approval",
    );
    state.project.policy = {
      ...(state.project.policy ?? {}),
      mode,
      version: Number(state.project.policy?.version ?? 0) + 1,
      autoMerge: false,
    };
    line("MODE", `${mode} — ${MODE_HELP[mode]}`);
    if (mode === "auto-fix" || mode === "full-auto")
      line(
        "SCOPE",
        `Automatic edits stay inside ${(state.project.profile?.autoPaths ?? ["docs/"]).join(", ")}.`,
      );
    if (!state.completed.includes("mode")) state.completed.push("mode");
  }

  if (want("project")) {
    step(4, "Project");
    const suggested =
      state.project.id ?? state.project.repository?.name ?? "project";
    const id = (await ask(`Project ID [${suggested}]:`)) || suggested;
    state.project.id = id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    state.project.name =
      (await ask(`Display name [${state.project.name ?? id}]:`)) ||
      state.project.name ||
      id;
    state.project.audience = state.project.audience ?? "team";
    state.project.profile = state.project.profile ?? defaultProfile();
    state.project.policy = state.project.policy ?? {
      mode: "approval",
      version: 1,
    };
    if (!state.env.GEMINI_API_KEY) {
      const key = await secret("Gemini API key (hidden):");
      if (key) state.env.GEMINI_API_KEY = key;
    }
    state.env.GEMINI_MODEL = state.env.GEMINI_MODEL || "gemini-2.5-flash";
    if (!state.completed.includes("project")) state.completed.push("project");
  }

  const files = await writeState(state);
  console.log();
  if (!files.config) {
    success(`Wrote ${files.env}.`);
    line(
      "STILL NEEDED",
      files
        .missing!.map((step) => `shadowqa setup --step ${step}`)
        .join("  →  "),
    );
    return state;
  }
  success(`Wrote ${files.env} and ${files.config}.`);
  const profile = state.project.profile ?? {};
  if (!profile.reviewed || !profile.externalInferenceApproved)
    line(
      "REVIEW",
      `Set profile.reviewed and profile.externalInferenceApproved in ${files.config} after reading the command profile.`,
    );
  line(
    "NEXT",
    "docker compose up -d  →  shadowqa bootstrap  →  shadowqa serve",
  );
  line(
    "THEN",
    "ShadowQA watches the selected channels and repository. shadowqa compile <project> starts planning.",
  );
  return state;
}

/** Renders the observation state the CLI shows between setup and the first compile. */
export function watchingSummary(status: any) {
  banner();
  console.log(cyan("  ShadowQA is watching.") + "\n");
  const projects = status.projects ?? [];
  for (const p of projects)
    line(
      String(p.id).toUpperCase(),
      `${p.mode}  ${p.enabled ? "enabled" : "disabled"}`,
    );
  line("SOURCES", `${status.sources ?? 0} source documents`);
  line("GEMINI CALLS TODAY", status.modelUsage?.calls ?? 0);
  for (const c of status.connections ?? [])
    line(
      String(c.provider ?? "source").toUpperCase(),
      c.error
        ? "degraded: " + c.error
        : `${c.gap ? "gap in history, " : ""}last ${c.lastSuccess ?? "—"}`,
    );
  return projects.length;
}

export async function ensureConfigured() {
  try {
    await access(configFile());
  } catch {
    throw new AppError("SETUP", "Run shadowqa setup first");
  }
}
