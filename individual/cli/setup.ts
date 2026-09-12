import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../../src/core/security.js";
import { git } from "../../src/runner/process.js";
import { workRoot } from "../core/execute.js";
import { detectAll } from "../core/backends.js";
import * as claudeCode from "../companion/src/adapters/claude-code.js";
import * as codex from "../companion/src/adapters/codex.js";
import { hostStatus, installHost } from "../companion/src/install.js";
import { Backend, Mode, type IndividualProject } from "../core/contracts.js";
import { banner, line, success, warn, note, cyan } from "./ui.js";

/**
 * Resolves the built extension folder from the compiled CLI location
 * (`dist-individual/individual/cli/` → repository root → `individual/extension/dist`).
 */
export function extensionDist() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(
    here,
    "..",
    "..",
    "..",
    "individual",
    "extension",
    "dist",
  );
}

export type Answer = (question: string) => Promise<string>;
export type Secret = (question: string) => Promise<string>;

export const STEPS = ["claude", "openai", "extension", "mode"] as const;
export type Step = (typeof STEPS)[number];

export const envFile = () => path.join(workRoot(), "individual.env");

export async function readEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  try {
    const text = await readFile(envFile(), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0)
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    /* first run */
  }
  return env;
}

/** Values the service reads on start. Written to the individual home, never to the repository. */
export async function writeEnv(values: Record<string, string>) {
  const merged = { ...(await readEnv()), ...values };
  await mkdir(workRoot(), { recursive: true });
  await writeFile(
    envFile(),
    [
      "# ShadowQA Individual. Written by `shadowqa-individual setup`.",
      ...Object.entries(merged)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${k}=${v}`),
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
  return envFile();
}

/** Loads the individual env into process.env without overriding an explicit shell value. */
export async function applyEnv() {
  for (const [key, value] of Object.entries(await readEnv()))
    if (!process.env[key]) process.env[key] = value;
}

export const MODE_HELP: Record<string, string> = {
  observe: "Watch and check only. ShadowQA never edits your code.",
  approval: "Ask first. Plans and repairs wait for your yes.",
  "auto-fix": "Bounded automatic repair inside the configured automatic paths.",
  "full-auto":
    "Same bounded scope, and approved plans run without a second confirmation.",
};

export const BACKEND_HELP: Record<string, string> = {
  opencode:
    "OpenCode, driven by your Gemini key. No coding subscription needed.",
  "claude-code": "Your Claude Code CLI and its own sign-in.",
  codex: "Your Codex CLI and its own sign-in.",
};

function step(index: number, title: string) {
  console.log("\n" + cyan(`  ${index}/4  ${title.toUpperCase()}`));
}

function choose<T>(items: T[], label: (item: T) => string) {
  items.forEach((item, i) =>
    console.log(`     ${String(i + 1).padStart(2)}  ${label(item)}`),
  );
}

export type SetupResult = {
  env: Record<string, string>;
  project?: Partial<IndividualProject>;
  extensionId?: string;
};

export async function setup(
  ask: Answer,
  secret: Secret,
  only?: Step,
): Promise<SetupResult> {
  banner();
  const env = await readEnv();
  const want = (name: Step) => !only || only === name;
  const result: SetupResult = { env };

  if (want("claude")) {
    step(1, "Claude");
    const backends = await detectAll();
    const claudeBackend = backends.find((b) => b.id === "claude-code")!;
    const transcripts = await claudeCode.detect();
    if (claudeBackend.available)
      success(`Claude Code CLI found (${claudeBackend.version}).`);
    else warn(claudeBackend.reason ?? "Claude Code CLI not found.");
    if (transcripts.available)
      success(
        `${transcripts.sessions} local Claude Code session transcript(s) at ${transcripts.root}.`,
      );
    else warn(transcripts.reason ?? "No Claude Code history yet.");
    note(
      "Claude Chat (claude.ai) is captured by the browser extension in step 3.",
    );
    note(
      "ShadowQA reads only sessions you opt in, and never your Claude account credentials.",
    );
    const hooks = (
      await ask(
        "Install Claude Code session hooks so new sessions are noticed? [y/N]",
      )
    ).toLowerCase();
    if (hooks === "y") {
      const command = `"${process.execPath}" "${path.join(workRoot(), "hooks", "claude-code.mjs")}"`;
      await writeHookScript();
      const installed = await claudeCode.installHooks(command);
      success(
        `Hooks written to ${installed.settingsFile} (${installed.events.join(", ")}).`,
      );
      warn(installed.note);
    } else {
      note(
        "Skipped. ShadowQA still reads transcripts you subscribe to with `sessions add`.",
      );
    }
  }

  if (want("openai")) {
    step(2, "OpenAI");
    const backends = await detectAll();
    const codexBackend = backends.find((b) => b.id === "codex")!;
    const rollouts = await codex.detect();
    if (codexBackend.available)
      success(`Codex CLI found (${codexBackend.version}).`);
    else warn(codexBackend.reason ?? "Codex CLI not found.");
    if (rollouts.available)
      success(
        `${rollouts.sessions} local Codex session file(s) at ${rollouts.root}.`,
      );
    else warn(rollouts.reason ?? "No Codex history yet.");
    note(
      "ChatGPT (chatgpt.com) is captured by the browser extension in step 3.",
    );
    note(
      "Codex threads that were never written to this machine are not visible to ShadowQA.",
    );
  }

  if (want("extension")) {
    step(3, "Extension");
    const dist = extensionDist();
    const built = await access(path.join(dist, "manifest.json"))
      .then(() => true)
      .catch(() => false);
    if (built) success("Built extension is ready to load unpacked.");
    else {
      warn("The extension has not been built yet.");
      note("Run: npm run build:extension:individual");
    }
    console.log();
    line("1.", "Open chrome://extensions and turn on Developer mode");
    line("2.", "Choose 'Load unpacked' and select:");
    console.log("      " + dist);
    line("3.", "Copy the extension ID shown on its card");
    console.log();
    const existing = await hostStatus();
    const id =
      (await ask(
        `Extension ID${existing.extensionId ? ` [${existing.extensionId}]` : ""}:`,
      )) || existing.extensionId;
    if (!id) {
      warn(
        "No extension ID given. Run `shadowqa-individual companion install <id>` later.",
      );
    } else {
      const installed = await installHost(id.trim());
      success(
        `Native messaging host registered for ${installed.installedFor.join(", ") || "no browser"}.`,
      );
      for (const skip of installed.skipped)
        note(`${skip.browser}: ${skip.reason}`);
      line("MANIFEST", installed.manifest);
      result.extensionId = id.trim();
      env.SHADOWQA_EXTENSION_ID = id.trim();
    }
    note(
      "Pair the side panel with `shadowqa-individual pair` once the service is running.",
    );
  }

  if (want("mode")) {
    step(4, "Mode");
    if (!env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
      note(
        "Planning and extraction use Gemini. Create a key at https://aistudio.google.com/apikey",
      );
      const key = await secret("Gemini API key (hidden):");
      if (key) env.GEMINI_API_KEY = key;
      else
        warn(
          "No key set. ShadowQA will refuse to plan rather than show invented results.",
        );
    }
    env.GEMINI_MODEL =
      env.GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";

    console.log();
    const modes = Object.keys(MODE_HELP);
    choose(modes, (m) => `${m.padEnd(10)} ${MODE_HELP[m]}`);
    const modeAnswer = (
      await ask("How should ShadowQA work? [approval]")
    ).trim();
    const mode = Mode.parse(
      /^\d+$/.test(modeAnswer)
        ? modes[Number(modeAnswer) - 1]
        : modeAnswer || "approval",
    );

    console.log();
    const available = await detectAll();
    const ids = Object.keys(BACKEND_HELP);
    choose(ids, (b) => {
      const status = available.find((a) => a.id === b);
      return `${b.padEnd(12)} ${status?.available ? "ready" : "not installed"}  ${BACKEND_HELP[b]}`;
    });
    const backendAnswer = (
      await ask("Which tool should run the code? [opencode]")
    ).trim();
    const backend = Backend.parse(
      /^\d+$/.test(backendAnswer)
        ? ids[Number(backendAnswer) - 1]
        : backendAnswer || "opencode",
    );
    const chosen = available.find((a) => a.id === backend);
    if (!chosen?.available)
      warn(`${backend} is not installed yet. ${chosen?.reason ?? ""}`);

    console.log();
    const projectId = (await ask("Project ID [my-project]:")) || "my-project";
    const folder = await ask("Repository folder (Enter to set later):");
    let repo: IndividualProject["repo"];
    if (folder) {
      const resolved = path.resolve(folder);
      const top = (
        await git(resolved, ["rev-parse", "--show-toplevel"]).catch(() => "")
      ).trim();
      if (!top)
        throw new AppError("REPO", "That folder is not a Git repository");
      if (path.resolve(top).toLowerCase() !== resolved.toLowerCase())
        throw new AppError("REPO", "Choose the repository root folder");
      const branch =
        (
          await git(resolved, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(
            () => "main",
          )
        ).trim() || "main";
      const remote = (
        await git(resolved, ["remote", "get-url", "origin"]).catch(() => "")
      ).trim();
      repo = {
        path: resolved,
        defaultBranch: branch,
        remote: remote || undefined,
      };
      success(`Repository ${resolved} on ${branch}.`);
      if (!remote)
        note(
          "No origin remote: pull requests are unavailable, local branches still work.",
        );
    }

    const checkAnswer = await ask(
      "Check command to verify changes [npm test]:",
    );
    const argv = (checkAnswer || "npm test").split(/\s+/).filter(Boolean);

    result.project = {
      id: projectId.toLowerCase().replace(/[^a-z0-9_.:-]/g, "-"),
      name: projectId,
      repo,
      backend,
      mode,
      checks: [{ id: "check", argv, timeoutSeconds: 900 }],
      requiredChecks: ["check"],
    };
    line("MODE", `${mode} — ${MODE_HELP[mode]}`);
    line("BACKEND", `${backend} — ${BACKEND_HELP[backend]}`);
  }

  const file = await writeEnv(env);
  console.log();
  success("Wrote " + file);
  line(
    "NEXT",
    "shadowqa-individual serve   (keeps watching; leave it running)",
  );
  line("THEN", "shadowqa-individual pair    (connect the browser side panel)");
  return result;
}

/**
 * The hook script Claude Code runs. It only reads the event, notes the transcript path and asks
 * the local service to sweep; it never blocks a tool call and never edits the session.
 */
async function writeHookScript() {
  const dir = path.join(workRoot(), "hooks");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "claude-code.mjs");
  await writeFile(
    file,
    `#!/usr/bin/env node
// Installed by shadowqa-individual setup. Tells the local service that a Claude Code session moved.
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
const home = process.env.SHADOWQA_INDIVIDUAL_HOME ?? path.join(os.homedir(), ".shadowqa-individual");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  try {
    const event = JSON.parse(input || "{}");
    const { url } = JSON.parse(readFileSync(path.join(home, "endpoint.json"), "utf8"));
    const token = readFileSync(path.join(home, "owner.token"), "utf8").trim();
    await fetch(url + "/observers/sweep", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ transcript: event.transcript_path, session: event.session_id }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // The service being offline is normal; the hook must never fail a Claude Code session.
  }
  process.exit(0);
});
`,
    { mode: 0o755 },
  );
  return file;
}

export { writeHookScript };
