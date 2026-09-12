#!/usr/bin/env node
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import chalk from "chalk";
import { AppError, sanitize } from "../../src/core/security.js";
import { MODE_TO_AUTONOMY, registerLiveCommands } from "../../src/cli/live.js";
import { GLYPH } from "../../src/cli/ui.js";
import { openDatabase, databaseLabel } from "../core/db.js";
import { Store } from "../core/store.js";
import { detectAll } from "../core/backends.js";
import { backendFor } from "../core/backends.js";
import { workRoot } from "../core/execute.js";
import {
  IndividualProject,
  Backend,
  Mode,
  type Plan,
} from "../core/contracts.js";
import { createService } from "../service/server.js";
import { ownerToken } from "../service/auth.js";
import { ServiceClient } from "../companion/src/client.js";
import {
  hostStatus,
  installHost,
  uninstallHost,
} from "../companion/src/install.js";
import { removeHooks } from "../companion/src/adapters/claude-code.js";
import {
  applyEnv,
  setup,
  STEPS,
  MODE_HELP,
  BACKEND_HELP,
  extensionDist,
  type Step,
} from "./setup.js";
import {
  banner,
  line,
  success,
  failure,
  warn,
  note,
  heading,
  table,
  renderPlan,
  renderItems,
  stateColor,
  cyan,
  ink,
} from "./ui.js";

const cli = new Command()
  .name("shadowqa-individual")
  .description(
    "◈ ShadowQA Individual — your AI conversations become verified code",
  )
  .version("0.1.0")
  .option("--json", "Machine-readable output");

const json = () => !!cli.opts().json;
const out = (data: unknown) => console.log(JSON.stringify(data, null, 2));

/** A command result: the whole payload with --json, a single confirmed line without it. */
const report = (summary: string, data: unknown) => {
  if (json()) out(data);
  else success(summary);
};

async function client() {
  await applyEnv();
  return ServiceClient.local(await ownerToken());
}

/**
 * The embedded database is single-process, so a command must never open it directly while the
 * service holds it. Anything that needs data goes through the API when the service is reachable.
 */
async function serviceIsRunning() {
  try {
    await (await client()).call("/health");
    return true;
  } catch {
    return false;
  }
}

async function withStore<T>(fn: (store: Store) => Promise<T>) {
  await applyEnv();
  if (await serviceIsRunning())
    throw new AppError(
      "SERVICE_RUNNING",
      "The service already has the local database open. Use the command that goes through it, or stop `shadowqa-individual serve` first.",
      409,
    );
  const db = await openDatabase();
  try {
    return await fn(new Store(db));
  } finally {
    await db.close();
  }
}

async function ask(question: string) {
  if (!stdin.isTTY)
    throw new AppError(
      "INTERACTIVE",
      "This command needs a terminal; pass explicit options instead",
    );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question("  " + question + " ")).trim();
  } finally {
    rl.close();
  }
}

async function secretPrompt(question: string): Promise<string> {
  if (!stdin.isTTY)
    throw new AppError("INTERACTIVE", "This command needs a terminal");
  stdout.write("  " + question + " ");
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const done = () => {
      stdin.off("data", listener);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const listener = (data: Buffer) => {
      const text = data.toString();
      if (text.includes("\u0003")) {
        done();
        reject(new Error("Cancelled"));
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        done();
        resolve(value);
        return;
      }
      if (text === "\u007f" || text === "\b") value = value.slice(0, -1);
      else value += text.replace(/[\x00-\x1f]/g, "");
    };
    stdin.on("data", listener);
  });
}

// ---------------------------------------------------------------------------
// setup and service
// ---------------------------------------------------------------------------

cli
  .command("setup")
  .description(
    "Guided connection: Claude, OpenAI, the browser extension, and how much to automate",
  )
  .option("--step <step>", "Repeat one step: " + STEPS.join(" | "))
  .action(async (options) => {
    if (options.step && !STEPS.includes(options.step))
      throw new AppError("SETUP", "Unknown step. Use " + STEPS.join(", "));
    const result = await setup(
      ask,
      secretPrompt,
      options.step as Step | undefined,
    );
    if (!result.project?.id) return;
    const body = {
      ...result.project,
      name: result.project.name ?? result.project.id,
      createdAt: new Date().toISOString(),
    };
    // Save through the service when it is running; otherwise open the database directly.
    if (await serviceIsRunning()) {
      const existing = await (await client()).call<any[]>("/projects");
      const current = existing.find((p) => p.id === body.id);
      await (
        await client()
      ).call(
        current ? `/projects/${body.id}` : "/projects",
        current ? "PATCH" : "POST",
        body,
      );
    } else {
      await withStore(async (store) => {
        const current = (await store.projects()).find((p) => p.id === body.id);
        await store.putProject(
          IndividualProject.parse({ ...(current ?? {}), ...body }),
        );
      });
    }
    success(`Project '${body.id}' saved.`);
  });

cli
  .command("serve")
  .description(
    "Run the local service: capture, extraction, planning, execution and QA",
  )
  .option(
    "--port <port>",
    "Loopback port",
    String(process.env.SHADOWQA_INDIVIDUAL_PORT ?? 4390),
  )
  .action(async (options) => {
    await applyEnv();
    const db = await openDatabase();
    const store = new Store(db);
    const service = await createService({
      store,
      ownerToken: await ownerToken(),
      port: Number(options.port),
    });
    const url = await service.listen();
    banner();
    success(`Service listening at ${url}`);
    line("DATABASE", databaseLabel());
    line(
      "MODEL",
      (process.env.GEMINI_MODEL ?? "gemini-2.5-flash") +
        (process.env.GEMINI_API_KEY ? "" : "  (no key configured)"),
    );
    line("HOME", workRoot());
    for (const backend of await detectAll())
      line(
        backend.id.toUpperCase(),
        backend.available
          ? `ready ${backend.version ?? ""}`.trim()
          : `unavailable — ${backend.reason}`,
      );
    console.log();
    note(
      "ShadowQA is watching. Leave this running; use another terminal for commands.",
    );
    let closing = false;
    const stop = async () => {
      if (closing) return;
      closing = true;
      await service.close();
      await db.close();
      process.exit(0);
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  });

cli
  .command("status")
  .alias("watching")
  .description("Show what ShadowQA is observing right now")
  .action(async () => {
    const status = await (await client()).call("/status");
    if (json()) return out(status);
    banner();
    console.log(cyan("  ShadowQA is watching.") + "\n");
    line("DATABASE", status.database);
    line(
      "MODEL",
      status.model.configured
        ? status.model.name
        : status.model.name + "  (no key)",
    );
    for (const backend of status.backends)
      line(
        backend.id.toUpperCase(),
        backend.available ? "ready" : "unavailable — " + (backend.reason ?? ""),
      );
    heading("projects");
    table(
      status.projects.map((p: any) => ({
        id: p.id,
        mode: p.mode,
        backend: p.backend,
        messages: p.messages,
        items: p.items,
        repo: p.repo ?? "—",
      })),
      ["id", "mode", "backend", "messages", "items", "repo"],
    );
    heading("conversations");
    if (!status.conversations.length)
      note("None tracked yet. Use the side panel to track one.");
    table(
      status.conversations.map((c: any) => ({
        origin: c.origin,
        title: c.title.slice(0, 40),
        messages: c.messageCount,
        coverage: c.coverage,
        state: c.paused ? "paused" : c.tracked ? "tracking" : "untracked",
        lastSync: c.lastSync?.slice(11, 19) ?? "—",
      })),
      ["origin", "title", "messages", "coverage", "state", "lastSync"],
    );
    heading("coding sessions");
    for (const [key, report] of Object.entries(status.observers ?? {})) {
      const r = report as any;
      if (!r) continue;
      line(
        key,
        r.available
          ? `${r.tracked} tracked of ${r.sessions} local session(s)`
          : "unavailable — " + (r.reason ?? ""),
      );
    }
    heading("work");
    table(
      status.tasks.slice(0, 10).map((t: any) => ({
        id: t.id.slice(0, 8),
        state: t.state,
        backend: t.backend,
        updated: t.updatedAt.slice(11, 19),
      })),
      ["id", "state", "backend", "updated"],
    );
    line("OPEN FINDINGS", status.findings);
  });

cli
  .command("doctor")
  .description("Check the local prerequisites and integrations")
  .action(async () => {
    await applyEnv();
    const results: { check: string; status: string; detail: string }[] = [];
    const add = (check: string, ok: boolean, detail = "") =>
      results.push({ check, status: ok ? "PASS" : "FAIL", detail });
    add(
      "Node >= 22",
      Number(process.versions.node.split(".")[0]) >= 22,
      process.versions.node,
    );
    add(
      "Gemini key",
      !!process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY ? "set" : "set GEMINI_API_KEY",
    );
    for (const backend of await detectAll())
      add(
        "backend: " + backend.id,
        backend.available,
        backend.version ?? backend.reason ?? "",
      );
    const host = await hostStatus();
    add(
      "native messaging host",
      host.installed,
      host.installed ? host.extensionId : "run setup --step extension",
    );
    try {
      const health = await (await client()).call("/health");
      add("service", !!health.ok, health.database ?? "");
    } catch (e: any) {
      add("service", false, sanitize(String(e.message)));
    }
    if (json()) return out(results);
    banner();
    table(results, ["check", "status", "detail"]);
    if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
  });

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

const project = cli
  .command("project")
  .description("Projects and their settings");

project.command("list").action(async () => {
  const projects = await (await client()).call("/projects");
  if (json()) return out(projects);
  table(
    projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      mode: p.mode,
      backend: p.backend,
      repo: p.repo?.path ?? "—",
    })),
    ["id", "name", "mode", "backend", "repo"],
  );
});

project
  .command("add <id>")
  .option("--repo <folder>", "Repository folder")
  .option("--backend <backend>", "opencode | claude-code | codex", "opencode")
  .option(
    "--mode <mode>",
    "observe | approval | auto-fix | full-auto",
    "approval",
  )
  .option("--check <command>", "Verification command", "npm test")
  .action(async (id, options) => {
    const argv = String(options.check).split(/\s+/).filter(Boolean);
    const body: any = {
      id,
      name: id,
      backend: Backend.parse(options.backend),
      mode: Mode.parse(options.mode),
      checks: [{ id: "check", argv, timeoutSeconds: 900 }],
      requiredChecks: ["check"],
    };
    if (options.repo)
      body.repo = { path: path.resolve(options.repo), defaultBranch: "main" };
    const created = await (await client()).call<any>("/projects", "POST", body);
    report(
      `Project '${created.id}' created — ${created.mode} mode, ${created.backend} backend${created.repo ? ", " + created.repo.path : ", no repository yet"}.`,
      created,
    );
  });

project
  .command("mode <id> <mode>")
  .description("Change automation mode; invalidates plans awaiting approval")
  .action(async (id, mode) => {
    const updated = await (
      await client()
    ).call<any>(`/projects/${id}`, "PATCH", { mode: Mode.parse(mode) });
    report(
      `'${id}' is now in ${updated.mode} mode (policy version ${updated.policyVersion}); plans awaiting approval were superseded.`,
      updated,
    );
  });

project
  .command("backend <id> <backend>")
  .description("opencode | claude-code | codex")
  .action(async (id, backend) => {
    const updated = await (
      await client()
    ).call<any>(`/projects/${id}`, "PATCH", {
      backend: Backend.parse(backend),
    });
    report(`'${id}' will run through ${updated.backend}.`, updated);
  });

project
  .command("repo <id> <folder>")
  .description("Point the project at a local repository")
  .action(async (id, folder) => {
    const updated = await (
      await client()
    ).call<any>(`/projects/${id}`, "PATCH", {
      repo: { path: path.resolve(folder), defaultBranch: "main" },
    });
    report(`'${id}' points at ${updated.repo.path}.`, updated);
  });

// ---------------------------------------------------------------------------
// conversations and coding sessions
// ---------------------------------------------------------------------------

cli
  .command("conversations")
  .description("List tracked conversations")
  .action(async () => {
    const conversations = await (await client()).call("/conversations");
    if (json()) return out(conversations);
    table(
      conversations.map((c: any) => ({
        id: c.id,
        origin: c.origin,
        title: c.title.slice(0, 40),
        messages: c.messageCount,
        coverage: c.coverage,
        state: c.paused ? "paused" : c.tracked ? "tracking" : "untracked",
      })),
      ["id", "origin", "title", "messages", "coverage", "state"],
    );
  });

cli
  .command("forget <conversation>")
  .description(
    "Delete a conversation's stored text and anything derived from it",
  )
  .action(async (id) => {
    const result = await (
      await client()
    ).call<any>(`/conversations/${encodeURIComponent(id)}`, "DELETE");
    report(
      `Deleted ${result.removedMessages} captured message(s) from '${id}' and everything extracted from them.`,
      result,
    );
  });

const sessions = cli
  .command("sessions")
  .description("Local Claude Code and Codex sessions");

sessions.command("list").action(async () => {
  const found = await (await client()).call("/observers/sessions");
  if (json()) return out(found);
  for (const [origin, list] of Object.entries(found)) {
    heading(origin);
    table(
      (list as any[]).slice(0, 15).map((s) => ({
        sessionId: s.sessionId,
        modified: s.modifiedAt?.slice(0, 19).replace("T", " "),
        kb: Math.round((s.bytes ?? 0) / 1024),
        file: s.file,
      })),
      ["sessionId", "modified", "kb"],
    );
  }
});

sessions
  .command("add <project> <origin> <sessionId>")
  .description("Track one local coding session: origin is claude-code or codex")
  .action(async (projectId, origin, sessionId) => {
    const found = await (await client()).call("/observers/sessions");
    const match = (found[origin] ?? []).find(
      (s: any) => s.sessionId === sessionId,
    );
    if (!match)
      throw new AppError(
        "NO_SESSION",
        "No such local session; run: sessions list",
      );
    const result = await (
      await client()
    ).call<any>("/observers/subscribe", "POST", {
      projectId,
      origin,
      sessionId,
      file: match.file,
    });
    report(
      `Following ${origin} session ${sessionId} for '${projectId}'; captured ${result.captured} turn(s) so far.`,
      result,
    );
  });

sessions
  .command("remove <origin> <sessionId>")
  .action(async (origin, sessionId) => {
    const remaining = await (
      await client()
    ).call<any[]>("/observers/unsubscribe", "POST", { origin, sessionId });
    report(
      `Stopped following ${origin} session ${sessionId}; ${remaining.length} session(s) still tracked.`,
      remaining,
    );
  });

sessions
  .command("sweep")
  .action(async () =>
    report(
      "Swept the subscribed coding sessions.",
      await (await client()).call("/observers/sweep", "POST", {}),
    ),
  );

// ---------------------------------------------------------------------------
// context
// ---------------------------------------------------------------------------

cli
  .command("context <project>")
  .option("-q, --query <text>", "Full-text query")
  .description("Show the captured messages in a project")
  .action(async (id, options) => {
    const messages = await (
      await client()
    ).call(
      `/projects/${id}/context?q=${encodeURIComponent(options.query ?? "")}`,
    );
    if (json()) return out(messages);
    for (const message of messages.slice(0, 40)) {
      console.log(
        cyan("  ◇ ") +
          chalk.dim(
            `${message.origin} · ${message.role} · ${message.timestampObserved ? message.time.slice(0, 19) : "no site timestamp"}`,
          ),
      );
      console.log(
        "    " + sanitize(message.text).replace(/\n/g, "\n    ").slice(0, 600),
      );
      console.log(chalk.dim("    " + message.id));
    }
    line("TOTAL", messages.length);
  });

cli
  .command("extract <project>")
  .option("-q, --query <text>", "Narrow the excerpts given to the model")
  .description(
    "Pull requirements, decisions and open questions out of captured context",
  )
  .action(async (id, options) => {
    const result = await (
      await client()
    ).call(`/projects/${id}/extract`, "POST", {
      query: options.query ?? "",
    });
    if (json()) return out(result);
    banner();
    line("EXCERPTS", result.excerpts);
    line("ITEMS", result.items.length);
    if (result.skipped.length)
      warn(`${result.skipped.length} item(s) dropped for citing nothing real.`);
    renderItems(result.items);
  });

cli
  .command("items <project>")
  .description("Show extracted requirements, decisions and questions")
  .action(async (id) => {
    const items = await (await client()).call<any[]>(`/projects/${id}/items`);
    if (json()) return out(items);
    if (!items.length)
      return note(
        `Nothing extracted yet. Run: shadowqa-individual extract ${id}`,
      );
    renderItems(items);
  });

cli
  .command("confirm <item>")
  .description("Mark an extracted item as confirmed by you")
  .action(async (id) => {
    const item = await (
      await client()
    ).call<any>(`/items/${id}`, "PATCH", { status: "confirmed" });
    report(`Confirmed: ${item.text}`, item);
  });

cli
  .command("reject <item>")
  .description("Mark an extracted item as wrong")
  .action(async (id) => {
    const item = await (
      await client()
    ).call<any>(`/items/${id}`, "PATCH", { status: "rejected" });
    report(`Rejected: ${item.text}`, item);
  });

cli
  .command("revise <item> <text...>")
  .description("Correct the text of an extracted item")
  .action(async (id, text) => {
    const item = await (
      await client()
    ).call<any>(`/items/${id}`, "PATCH", { text: text.join(" ") });
    report(`Revised, and marked as edited by you: ${item.text}`, item);
  });

// ---------------------------------------------------------------------------
// plan, approve, execute
// ---------------------------------------------------------------------------

cli
  .command("plan <project>")
  .description("Generate a repository-grounded plan with Gemini")
  .option("-o, --objective <text>", "What you want done")
  .option("-q, --query <text>", "Narrow the context used")
  .option("-b, --backend <backend>", "opencode | claude-code | codex")
  .action(async (id, options) => {
    const plan = await (
      await client()
    ).call<Plan>(`/projects/${id}/plan`, "POST", {
      objective: options.objective ?? "",
      query: options.query ?? "",
      backend: options.backend,
    });
    if (json()) return out(plan);
    renderPlan(plan);
    console.log();
    note(`Approve with: shadowqa-individual approve ${plan.id}`);
  });

cli.command("plans").action(async () => {
  const plans = await (await client()).call("/plans");
  if (json()) return out(plans);
  table(
    plans.map((p: any) => ({
      id: p.id,
      project: p.projectId,
      status: p.status,
      backend: p.backend,
      objective: p.objective.slice(0, 46),
    })),
    ["id", "project", "status", "backend", "objective"],
  );
});

cli.command("show <plan>").action(async (id) => {
  const plan = await (await client()).call<any>(`/plans/${id}`);
  if (json()) return out(plan);
  renderPlan(plan);
});

async function decide(id: string, yes: boolean, reject: boolean) {
  const service = await client();
  const plan = await service.call<any>(`/plans/${id}`);
  if (!json()) renderPlan(plan);
  if (plan.freshness && !plan.freshness.fresh)
    throw new AppError("STALE_PLAN", plan.freshness.reason);
  // The team edition refuses a plan with open questions outright. Here the developer who would
  // answer them is the one approving, so it asks instead — but it does not let the question pass
  // by unremarked.
  if (!reject && plan.unresolvedQuestions?.length)
    warn(
      `${plan.unresolvedQuestions.length} question(s) are still unanswered. Approving means the agent will proceed without an answer.`,
    );
  if (!yes) {
    const answer = await ask(
      reject
        ? "Reject this plan? [y/N]"
        : `Run this exact plan through ${plan.backend}? [y/N]`,
    );
    if (answer.toLowerCase() !== "y") return;
  }
  const result = await service.call(`/plans/${id}/approve`, "POST", {
    digest: plan.digest,
    decision: reject ? "reject" : "approve",
  });
  if (json()) return out(result);
  if (reject) return success("Plan rejected.");
  success(
    `Approved. Task ${result.task.id.slice(0, 8)} queued on ${result.task.backend}.`,
  );
  note(
    `Follow it with: shadowqa-individual task ${result.task.id.slice(0, 8)}`,
  );
}

cli
  .command("approve <plan>")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(async (id, options) => decide(id, !!options.yes, false));

cli
  .command("decline <plan>")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(async (id, options) => decide(id, !!options.yes, true));

async function resolveTask(service: ServiceClient, prefix: string) {
  const tasks = await service.call<any[]>("/tasks");
  const match = tasks.filter((t) => t.id.startsWith(prefix));
  if (!match.length)
    throw new AppError("NO_TASK", "No task starting with " + sanitize(prefix));
  if (match.length > 1)
    throw new AppError("AMBIGUOUS", "Several tasks match that prefix");
  return match[0].id as string;
}

cli.command("tasks").action(async () => {
  const tasks = await (await client()).call("/tasks");
  if (json()) return out(tasks);
  table(
    tasks.map((t: any) => ({
      id: t.id.slice(0, 8),
      project: t.projectId,
      state: t.state,
      backend: t.backend,
      updated: t.updatedAt.slice(11, 19),
    })),
    ["id", "project", "state", "backend", "updated"],
  );
});

cli
  .command("task <id>")
  .description(
    "Show progress, the agent session, checks and the resulting diff",
  )
  .action(async (prefix) => {
    const service = await client();
    const task = await service.call<any>(
      `/tasks/${await resolveTask(service, prefix)}`,
    );
    if (json()) return out(task);
    banner();
    line("TASK", task.id);
    line("STATE", stateColor(task.state));
    line("BACKEND", task.backend);
    if (task.sessionRef) line("SESSION", task.sessionRef);
    if (task.result?.attach) line("OPEN IN IDE", task.result.attach);
    if (task.result?.branch)
      line(
        "BRANCH",
        `${task.result.branch} (${task.result.commit?.slice(0, 8)})`,
      );
    if (task.error) warn(task.error);
    heading("progress");
    for (const event of task.events.slice(-25))
      console.log(
        chalk.dim("  " + event.at.slice(11, 19) + "  ") +
          sanitize(event.message),
      );
    if (task.checks?.length) {
      heading("checks");
      table(
        task.checks.map((c: any) => ({
          id: c.id,
          exit: c.exitCode,
          ms: c.durationMs,
          timedOut: c.timedOut ? "yes" : "no",
        })),
        ["id", "exit", "ms", "timedOut"],
      );
    }
    if (task.result?.agentReportedSuccess === false)
      warn(
        "The agent reported failure; the checks were still run independently.",
      );
  });

cli
  .command("diff <id>")
  .description("Show the verified patch")
  .action(async (prefix) => {
    const service = await client();
    const task = await service.call<any>(
      `/tasks/${await resolveTask(service, prefix)}`,
    );
    if (!task.diff)
      throw new AppError("NO_DIFF", "This task has no frozen patch yet");
    if (json()) return out({ diff: task.diff });
    console.log(task.diff);
  });

cli
  .command("open <id>")
  .description(
    "Print the command that opens this task's agent session in your IDE terminal",
  )
  .action(async (prefix) => {
    const service = await client();
    const task = await service.call<any>(
      `/tasks/${await resolveTask(service, prefix)}`,
    );
    const command =
      task.result?.attach ??
      backendFor(task.backend).attachCommand(
        task.workspace ?? "",
        task.sessionRef ?? "",
      );
    if (json()) return out({ command, workspace: task.workspace });
    banner();
    line("WORKSPACE", task.workspace ?? "—");
    line("COMMAND", command);
    note(
      "Run it in your IDE's integrated terminal to continue in the same session.",
    );
  });

cli
  .command("cancel <id>")
  .description("Stop a task that is still queued, waiting or running")
  .action(async (prefix) => {
    const service = await client();
    const id = await resolveTask(service, prefix);
    const result = await service.call<any>(`/tasks/${id}/cancel`, "POST", {});
    report(
      result.wasRunning
        ? `Cancelled ${id.slice(0, 8)}; the running ${result.previousState} step was aborted.`
        : `Cancelled ${id.slice(0, 8)} before it started.`,
      result,
    );
  });

cli
  .command("pr <id>")
  .description(
    "Open a pull request for a verified task (needs a GitHub remote and GITHUB_TOKEN)",
  )
  .action(async (prefix) => {
    const service = await client();
    const pr = await service.call<any>(
      `/tasks/${await resolveTask(service, prefix)}/pull-request`,
      "POST",
      {},
    );
    report(`Opened pull request #${pr.number}: ${pr.url}`, pr);
  });

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

cli.command("findings").action(async () => {
  const findings = await (await client()).call("/findings");
  if (json()) return out(findings);
  if (!findings.length) return note("No findings.");
  table(
    findings.map((f: any) => ({
      id: f.id.slice(0, 10),
      rule: f.rule,
      class: f.classification,
      state: f.state,
      seen: f.occurrences,
      last: f.lastSeen?.slice(11, 19),
    })),
    ["id", "rule", "class", "state", "seen", "last"],
  );
});

cli
  .command("scan <project>")
  .description("Run the project's checks against a clean copy of HEAD")
  .action(async (id) => {
    const result = await (
      await client()
    ).call(`/projects/${id}/scan`, "POST", {});
    if (json()) return out(result);
    banner();
    line("BASE", result.sha);
    table(
      result.checks.map((c: any) => ({
        id: c.id,
        exit: c.exitCode,
        ms: c.durationMs,
      })),
      ["id", "exit", "ms"],
    );
    for (const finding of result.findings)
      warn(`${finding.id.slice(0, 10)} ${finding.classification}`);
  });

cli
  .command("repair <finding>")
  .description("Compile a scoped repair plan for a finding")
  .action(async (id) => {
    const result = await (
      await client()
    ).call(`/findings/${id}/repair`, "POST", {});
    if (json()) return out(result);
    renderPlan(result.plan);
    if (result.autoQueued)
      success(
        "Queued automatically: the change stays inside the automatic paths.",
      );
    else
      note(
        result.reason ??
          `Approve with: shadowqa-individual approve ${result.plan.id}`,
      );
  });

registerLiveCommands(cli, {
  json,
  output: out,
  autonomyForProject: async (id) => {
    const p = (await (await client()).call<any[]>("/projects")).find((x) => x.id === id);
    if (!p) throw new AppError("NO_PROJECT", `No project '${id}'. Run: shadowqa-individual project list`);
    return MODE_TO_AUTONOMY[p.mode] ?? "approve_all";
  },
});

cli
  .command("watch <project>")
  .description("Watch saved files and run the checks on every pause in typing")
  .option("--stop", "Stop watching this project")
  .action(async (id, options) => {
    const service = await client();
    if (options.stop) {
      out(
        await service.call(`/projects/${id}/watch`, "POST", { enabled: false }),
      );
      return;
    }
    // The watcher runs inside the service, which already holds the embedded database.
    const started = await service.call<any>(`/projects/${id}/watch`, "POST", {
      enabled: true,
    });
    if (json()) return out(started);
    banner();
    success(
      `Watching saved files in ${started.folder ?? "the project repository"}. Checks run after 8 seconds of quiet.`,
    );
    note(
      "Ctrl+C stops following; the watcher keeps running. Use --stop to end it.",
    );
    let seen = 0;
    for (;;) {
      const watchers = await service.call<any[]>("/watchers");
      const entry = watchers.find((w) => w.projectId === id);
      if (!entry) {
        failure("The watcher stopped.");
        return;
      }
      for (const info of entry.results.slice(seen)) {
        if (!info.snapshot) failure("Scan error; see the audit log.");
        else {
          line(info.stale ? "STALE SNAPSHOT" : "SNAPSHOT", info.snapshot);
          for (const check of info.checks)
            line(
              check.exitCode === 0 ? "PASS" : "FAIL",
              `${check.id} (${check.durationMs} ms)`,
            );
          for (const finding of info.findings)
            warn(
              `${finding.id.slice(0, 10)} ${finding.classification} — ${finding.rule}`,
            );
        }
      }
      seen = entry.results.length;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  });

// ---------------------------------------------------------------------------
// pairing and companion
// ---------------------------------------------------------------------------

cli
  .command("pair")
  .description("Show a one-time code to type into the extension side panel")
  .action(async () => {
    const result = await (await client()).call("/pair/start", "POST", {});
    if (json()) return out(result);
    banner();
    console.log("  " + ink.bold(result.code.split("").join(" ")) + "\n");
    note(
      `Type it into the ShadowQA side panel within ${result.expiresInMinutes} minutes.`,
    );
  });

cli
  .command("unpair")
  .description("Revoke every paired extension")
  .action(async () =>
    report(
      "Every paired extension was revoked. Run pair again to reconnect the side panel.",
      await (await client()).call("/pair/revoke", "POST", {}),
    ),
  );

const companion = cli.command("companion").description("Native messaging host");

companion
  .command("install <extensionId>")
  .description(
    "Register the native messaging host for this Chrome extension ID",
  )
  .action(async (id) => {
    const result = await installHost(id);
    if (json()) return out(result);
    banner();
    success(
      `Registered for ${result.installedFor.join(", ") || "no browser"}.`,
    );
    line("MANIFEST", result.manifest);
    line("LAUNCHER", result.launcher);
    for (const skip of result.skipped) note(`${skip.browser}: ${skip.reason}`);
  });

companion
  .command("uninstall")
  .description("Remove the native messaging host and the Claude Code hooks")
  .action(async () => {
    const removed = await uninstallHost();
    const hooks = await removeHooks().catch(() => ({ removed: 0 }));
    report(
      `Removed the host from ${removed.removed.join(", ") || "no browser"} and ${hooks.removed} Claude Code hook(s).`,
      { ...removed, hooks },
    );
  });

companion.command("status").action(async () => {
  const status = await hostStatus();
  if (json()) return out(status);
  banner();
  line("INSTALLED", status.installed ? "yes" : "no");
  line("EXTENSION", status.extensionId || "—");
  line("MANIFEST", status.manifest);
  line("LAUNCHER", status.launcher);
  line("EXTENSION FOLDER", extensionDist());
});

// ---------------------------------------------------------------------------
// interactive command centre
// ---------------------------------------------------------------------------

cli
  .command("ui")
  .description("Interactive command centre")
  .action(async () => {
    for (;;) {
      const service = await client();
      const status = await service.call<any>("/status");
      banner();
      console.log(cyan("  ShadowQA is watching.") + "\n");
      table(
        status.projects.map((p: any) => ({
          id: p.id,
          mode: p.mode,
          backend: p.backend,
          messages: p.messages,
          items: p.items,
        })),
        ["id", "mode", "backend", "messages", "items"],
      );
      line("CONVERSATIONS", status.conversations.length);
      line("OPEN FINDINGS", status.findings);
      console.log(
        "\n  1  Extract context\n  2  Generate a plan\n  3  Review and approve\n  4  Tasks and sessions\n  5  Findings\n  6  Change mode or backend\n  7  Pair the extension\n  8  " +
          GLYPH.live +
          " Live runtime incidents\n  0  Exit\n",
      );
      const choice = await ask("Choose →");
      if (choice === "0") break;
      try {
        if (choice === "8") {
          const { LiveClient, renderIncidents, renderIncident } = await import("../../src/cli/live.js");
          renderIncidents(await new LiveClient().call("/incidents?limit=20"));
          const id = await ask("Incident ID to inspect (Enter to return):");
          if (id) renderIncident(await new LiveClient().call(`/incidents/${id}`));
        }
        if (choice === "1") {
          const id = await ask("Project:");
          const result = await service.call<any>(
            `/projects/${id}/extract`,
            "POST",
            {},
          );
          renderItems(result.items);
        }
        if (choice === "2") {
          const id = await ask("Project:");
          const objective = await ask("What do you want done?");
          const plan = await service.call<Plan>(
            `/projects/${id}/plan`,
            "POST",
            { objective },
          );
          renderPlan(plan);
          if ((await ask("Approve now? [y/N]")).toLowerCase() === "y")
            await decide(plan.id, true, false);
        }
        if (choice === "3") {
          const plans = await service.call<any[]>("/plans");
          table(
            plans.map((p) => ({
              id: p.id,
              status: p.status,
              objective: p.objective.slice(0, 50),
            })),
            ["id", "status", "objective"],
          );
          const id = await ask("Plan to review (Enter to return):");
          if (id) await decide(id, false, false);
        }
        if (choice === "4") {
          const tasks = await service.call<any[]>("/tasks");
          table(
            tasks.map((t) => ({
              id: t.id.slice(0, 8),
              state: t.state,
              backend: t.backend,
            })),
            ["id", "state", "backend"],
          );
          const id = await ask("Task id prefix (Enter to return):");
          if (id) {
            const task = await service.call<any>(
              `/tasks/${await resolveTask(service, id)}`,
            );
            for (const event of task.events.slice(-20))
              console.log(
                chalk.dim("  " + event.at.slice(11, 19) + "  ") +
                  sanitize(event.message),
              );
            if (task.result?.attach) line("OPEN IN IDE", task.result.attach);
          }
        }
        if (choice === "5") {
          const findings = await service.call<any[]>("/findings");
          table(
            findings.map((f) => ({
              id: f.id.slice(0, 10),
              rule: f.rule,
              class: f.classification,
            })),
            ["id", "rule", "class"],
          );
        }
        if (choice === "6") {
          const id = await ask("Project:");
          const mode = await ask(
            "Mode (" + Object.keys(MODE_HELP).join(" / ") + ", Enter to keep):",
          );
          const backend = await ask(
            "Backend (" +
              Object.keys(BACKEND_HELP).join(" / ") +
              ", Enter to keep):",
          );
          const patch: any = {};
          if (mode) patch.mode = Mode.parse(mode);
          if (backend) patch.backend = Backend.parse(backend);
          if (Object.keys(patch).length)
            out(await service.call(`/projects/${id}`, "PATCH", patch));
        }
        if (choice === "7") {
          const result = await service.call<any>("/pair/start", "POST", {});
          console.log(
            "\n  " + ink.bold(result.code.split("").join(" ")) + "\n",
          );
        }
      } catch (e: any) {
        failure(e.message);
      }
      await ask("Press Enter to continue.");
    }
  });

cli.parseAsync().catch((e) => {
  if (json())
    console.error(
      JSON.stringify({ code: e.code ?? "ERROR", message: sanitize(e.message) }),
    );
  else failure(e.message);
  process.exitCode = 1;
});
