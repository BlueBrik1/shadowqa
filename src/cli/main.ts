#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { AsyncEntry } from "@napi-rs/keyring";
import { fileURLToPath } from "node:url";
import { Database } from "../db/database.js";
import { environment, loadConfig } from "../core/config.js";
import { hash, token, AppError, sanitize } from "../core/security.js";
import { Client, credentialKey } from "./client.js";
import { banner, line, success, failure, table, renderPlan } from "./ui.js";
import { setup, STEPS, watchingSummary, type Step } from "./setup.js";
import { createServer } from "../api/server.js";
import { Worker } from "../api/worker.js";
import { SlackAdapter } from "../adapters/slack.js";
import { GitHub } from "../adapters/github.js";
import { Runner, runnerRoot, loadMappings } from "../runner/runner.js";
import { Sandbox } from "../runner/sandbox.js";
import { run } from "../runner/process.js";
import { inspect } from "../planner/inspect.js";
import type { Plan, Project } from "../core/contracts.js";
const cli = new Command()
  .name("shadowqa")
  .description("◈ Context-aware QA in your terminal and IDE")
  .version("0.1.0")
  .option("--url <url>", "Service URL")
  .option("--json", "Machine-readable output");
const client = () => new Client(cli.opts().url ?? environment().url);
const output = (data: any) => {
  if (cli.opts().json) console.log(JSON.stringify(data, null, 2));
  else if (Array.isArray(data) && data.length && typeof data[0] === "object")
    table(
      data,
      Object.keys(data[0])
        .filter((k) => typeof data[0][k] !== "object")
        .slice(0, 6),
    );
  else console.log(JSON.stringify(data, null, 2));
};
async function ask(question: string) {
  if (!stdin.isTTY)
    throw new AppError(
      "INTERACTIVE",
      "Use explicit command options in noninteractive shells",
    );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question("  " + question + " ")).trim();
  } finally {
    rl.close();
  }
}
async function dbAction<T>(fn: (db: Database) => Promise<T>) {
  const db = Database.connect(environment().database);
  try {
    await db.migrate();
    return await fn(db);
  } finally {
    await db.close();
  }
}
cli
  .command("init")
  .description("Create local configuration and environment templates")
  .action(async () => {
    const source = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    for (const [from, to] of [
      [".env.example", ".env"],
      ["shadowqa.config.example.json", "shadowqa.config.json"],
    ]) {
      try {
        await access(to);
        line("EXISTS", to);
      } catch {
        await copyFile(path.join(source, from), to);
        success(`Created ${to}`);
      }
    }
    banner();
    line(
      "NEXT",
      "Edit .env and shadowqa.config.json, then docker compose up -d",
    );
    line("THEN", "shadowqa bootstrap → shadowqa serve");
  });
cli
  .command("setup")
  .description(
    "Guided connection: Slack, GitHub, automation mode, project. Verifies each account live.",
  )
  .option("--step <step>", "Repeat one step: " + STEPS.join(" | "))
  .action(async (opts) => {
    if (opts.step && !STEPS.includes(opts.step))
      throw new AppError("SETUP", "Unknown step. Use " + STEPS.join(", "));
    await setup(ask, secretPrompt, opts.step as Step | undefined);
  });
cli
  .command("watching")
  .description("Show what ShadowQA is currently observing")
  .action(async () => {
    const status = await client().call("/status");
    if (cli.opts().json) return output(status);
    if (!watchingSummary(status))
      line("EMPTY", "No projects yet. Run shadowqa setup.");
  });
cli
  .command("bootstrap")
  .description(
    "Migrate PostgreSQL, import configuration, create the first administrator",
  )
  .action(async () => {
    const env = environment(),
      config = await loadConfig();
    const result = await dbAction(async (db) =>
      db.tx(async (tx) => {
        await tx.rows(
          "INSERT INTO entities(tenant,kind,id,data) VALUES($1,'control','bootstrap','{}') ON CONFLICT DO NOTHING",
          [env.tenant],
        );
        await tx.rows(
          "SELECT id FROM entities WHERE tenant=$1 AND kind='control' AND id='bootstrap' FOR UPDATE",
          [env.tenant],
        );
        const exists = await tx.one(
          "SELECT 1 FROM credentials WHERE tenant=$1 LIMIT 1",
          [env.tenant],
        );
        if (exists)
          throw new AppError(
            "BOOTSTRAPPED",
            "Already initialized. Use project import and member commands through the authenticated API.",
          );
        for (const p of config.projects) {
          await tx.put(env.tenant, "project", p.id, p, p.id);
          await tx.put(
            env.tenant,
            "policy-grant",
            p.id,
            { actorId: "admin", version: p.policy.version },
            p.id,
          );
        }
        const raw = token();
        await tx.rows(
          "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,'admin','admin','[]')",
          [hash(raw), env.tenant],
        );
        await tx.audit(env.tenant, "admin", "workspace.bootstrap", env.tenant);
        return raw;
      }),
    );
    try {
      await credentialKey(env.url).setPassword(result);
      success("Administrator credential saved in OS credential storage.");
    } catch {
      line("ONE-TIME TOKEN", result);
      line(
        "NEXT",
        "Save it securely; run shadowqa login or set SHADOWQA_TOKEN.",
      );
    }
    success("Database migrated and projects registered. Run shadowqa serve.");
  });
cli
  .command("login")
  .description(
    "Store a supplied membership or runner token in OS credential storage",
  )
  .option("--runner", "Store runner credential")
  .action(async (opts) => {
    // Token entry is masked by a minimal readline key handler; never use a visible CLI argument.
    const raw = await secretPrompt("Paste token (hidden):");
    const url = client().url;
    const me = await new Client(url, raw).call("/me");
    if (opts.runner && me.role !== "runner")
      throw new AppError("ROLE", "Expected a runner credential");
    await credentialKey(url, opts.runner ? "runner" : "user").setPassword(raw);
    success(`Signed in as ${me.id} (${me.role}).`);
  });
cli
  .command("logout")
  .option("--runner", "Remove runner credential")
  .action(async (opts) => {
    await credentialKey(
      client().url,
      opts.runner ? "runner" : "user",
    ).deletePassword();
    success("Local credential removed.");
  });
cli
  .command("serve")
  .description(
    "Run API, durable worker, Slack Socket Mode and GitHub reconciliation",
  )
  .action(async () => {
    const env = environment(),
      db = Database.connect(env.database);
    await db.migrate();
    const slack = new SlackAdapter(db, env.tenant),
      github = new GitHub(db, env.tenant);
    const api = createServer(db, { tenant: env.tenant, slack, github }),
      worker = new Worker(db, env.tenant, github, slack);
    await api.listen({ host: env.host, port: env.port });
    try {
      await slack.start();
    } catch (e) {
      failure("Slack is degraded: " + String(e));
      // The provider is part of the record, not only the key: `status` reads these as a flat list.
      await db.put(env.tenant, "connection", "slack", {
        provider: "slack",
        state: "failed",
        lastSuccess: null,
        error: sanitize(String(e)),
      });
    }
    worker.start();
    banner();
    success(`Service listening at ${env.url}`);
    line(
      "CONTEXT",
      "Accumulating only. Run shadowqa compile <project> to generate a plan.",
    );
    let closing = false;
    const stop = async () => {
      if (closing) return;
      closing = true;
      await slack.stop();
      await worker.stop();
      await api.close();
      await db.close();
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  });
cli
  .command("status")
  .description("Show observation, runners, job queue, modes and quotas")
  .action(async () => {
    const status = await client().call("/status");
    if (cli.opts().json) return output(status);
    banner();
    table(status.projects, ["id", "name", "mode", "enabled"]);
    console.log();
    line("SOURCES", status.sources);
    line("KILL SWITCH", status.killed ? "ON" : "off");
    line("GEMINI CALLS TODAY", status.modelUsage?.calls ?? 0);
    table(status.jobs, ["state", "count"]);
    console.log();
    table(
      status.runners.map((r: any) => ({
        ...r,
        online: !!r.lastSeen && Date.now() - Date.parse(r.lastSeen) < 30_000,
      })),
      ["name", "online", "lastSeen"],
    );
    console.log();
    table(status.connections, [
      "provider",
      "projectId",
      "gap",
      "lastSuccess",
      "error",
    ]);
  });
const project = cli
  .command("project")
  .description("Project configuration and policy");
project
  .command("list")
  .action(async () => output(await client().call("/projects")));
project
  .command("import [file]")
  .description("Import administrator-reviewed project configuration")
  .action(async (file?: string) => {
    const config = await loadConfig(file);
    for (const p of config.projects) {
      await client().call(`/projects/${p.id}`, "PUT", p);
      success("Configured " + p.id);
    }
  });
project
  .command("mode <id> <mode>")
  .description(
    "observe | approval | auto-fix | full-auto; invalidates existing approvals",
  )
  .action(async (id, mode) =>
    output(await client().call(`/projects/${id}/mode`, "POST", { mode })),
  );
project
  .command("sync <id>")
  .description("Reconcile GitHub evidence and backfill approved Slack channels")
  .action(async (id) =>
    output(await client().call(`/projects/${id}/sync`, "POST", {})),
  );
cli
  .command("context <project>")
  .option("-q, --query <query>", "Full-text query")
  .description("Read source-linked context")
  .action(async (id, opts) =>
    output(
      await client().call(
        `/projects/${id}/context?q=${encodeURIComponent(opts.query ?? "")}`,
      ),
    ),
  );
cli
  .command("confirm <source>")
  .description("Confirm a source decision under your authenticated identity")
  .action(async (id) =>
    output(await client().call(`/sources/${id}/confirm`, "POST", {})),
  );
cli
  .command("compile <project>")
  .description("Compile context, inspect repository, generate a Gemini plan")
  .option("-o, --objective <text>", "Explicit objective")
  .option("-q, --query <text>", "Narrow context retrieval")
  .action(async (id, opts) => {
    const plan = await client().call<Plan>(`/projects/${id}/compile`, "POST", {
      objective: opts.objective ?? "",
      query: opts.query ?? "",
    });
    if (cli.opts().json) output(plan);
    else renderPlan(plan);
  });
cli.command("plans").action(async () => output(await client().call("/plans")));
cli.command("plan <id>").action(async (id) => {
  const p = await client().call<Plan>(`/plans/${id}`);
  if (cli.opts().json) output(p);
  else renderPlan(p);
});
async function approve(id: string, yes = false, reject = false) {
  const challenge = await client().call(`/plans/${id}/challenge`, "POST", {});
  if (!cli.opts().json) renderPlan(challenge.plan);
  if (
    !yes &&
    (
      await ask(
        reject
          ? "Reject this exact plan? [y/N]"
          : "Approve this exact plan, its base and command profile? [y/N]",
      )
    ).toLowerCase() !== "y"
  )
    return;
  output(
    await client().call(`/plans/${id}/approvals`, "POST", {
      approvalId: challenge.id,
      nonce: challenge.nonce,
      digest: challenge.digest,
      decision: reject ? "reject" : "approve",
    }),
  );
}
cli
  .command("approve <plan>")
  .option(
    "-y, --yes",
    "Approve the displayed exact plan without an interactive prompt",
  )
  .action(async (id, opts) => approve(id, opts.yes));
cli
  .command("reject <plan>")
  .option("-y, --yes", "Reject without an interactive prompt")
  .action(async (id, opts) => approve(id, opts.yes, true));
cli.command("tasks").action(async () => output(await client().call("/tasks")));
cli
  .command("task <id>")
  .action(async (id) => output(await client().call(`/tasks/${id}`)));
cli.command("jobs").action(async () => output(await client().call("/jobs")));
cli
  .command("job <id>")
  .action(async (id) => output(await client().call(`/jobs/${id}`)));
cli
  .command("cancel <job>")
  .action(async (id) =>
    output(await client().call(`/jobs/${id}/cancel`, "POST", {})),
  );
cli
  .command("diff <job>")
  .description("Show the frozen patch from independent verification")
  .action(async (id) => {
    const artifacts = await client().call(`/jobs/${id}/artifacts`);
    const artifact = artifacts.find((a: any) => a.diff !== undefined);
    if (!artifact)
      throw new AppError("NO_DIFF", "No verified patch artifact yet");
    if (cli.opts().json) output(artifact);
    else console.log(artifact.diff);
  });
cli.command("logs <job>").action(async (id) => {
  const job = await client().call(`/jobs/${id}`);
  for (const e of job.events)
    line(e.event.state ?? "progress", e.event.message);
});
cli
  .command("findings")
  .action(async () => output(await client().call("/findings")));
cli
  .command("suppress <finding>")
  .requiredOption("--reason <text>", "Audited reason")
  .option("--hours <hours>", "Suppression duration", "24")
  .action(async (id, opts) =>
    output(
      await client().call(`/findings/${id}/suppress`, "POST", {
        reason: opts.reason,
        hours: Number(opts.hours),
      }),
    ),
  );
cli
  .command("repair <finding>")
  .description(
    "Compile a scoped repair plan with lineage, cooldown and attempt caps",
  )
  .action(async (id) => {
    const p = await client().call<Plan>(`/findings/${id}/repair`, "POST", {});
    if (cli.opts().json) output(p);
    else renderPlan(p);
  });
cli
  .command("scan <project>")
  .description("Queue independent checks at the configured base SHA")
  .action(async (id) =>
    output(await client().call(`/projects/${id}/scan`, "POST", {})),
  );
cli
  .command("watch <project>")
  .description("Consent to watching saved files; never changes original files")
  .requiredOption("--folder <path>", "Explicit local folder consent")
  .action(async (id, opts) => {
    const p = (await client().call<Project[]>("/projects")).find(
      (p) => p.id === id,
    );
    if (!p) throw new Error("Project not found");
    const { watch } = await import("./watch.js");
    await watch(p, opts.folder);
  });
cli
  .command("pause")
  .description("Activate workspace kill switch and cancel active/queued jobs")
  .action(async () =>
    output(await client().call("/control/kill", "POST", { enabled: true })),
  );
cli
  .command("resume")
  .description(
    "Disable kill switch; cancelled jobs are not automatically restarted",
  )
  .action(async () =>
    output(await client().call("/control/kill", "POST", { enabled: false })),
  );
const runner = cli
  .command("runner")
  .description("Pair, map and run isolated execution");
runner
  .command("register <name>")
  .requiredOption("--projects <ids>", "Comma-separated permitted project IDs")
  .action(async (name, opts) => {
    const registration = await client().call("/runners/register", "POST", {
      name,
      projects: opts.projects.split(","),
    });
    await credentialKey(client().url, "runner").setPassword(registration.token);
    success("Runner credential saved to OS keyring.");
    line("RUNNER", registration.id);
  });
runner
  .command("map <project> <folder>")
  .description(
    "Review and consent to a local repository + exact command-profile digest",
  )
  .option(
    "--accept-profile",
    "Accept the configured profile after reviewing project configuration",
  )
  .action(async (id, folder, opts) => {
    const p = (await client().call<Project[]>("/projects")).find(
      (p) => p.id === id,
    );
    if (!p) throw new Error("Project not found");
    p.repository.localPath = path.resolve(folder);
    await inspect(p);
    await new Sandbox("shadowqa-map", p.profile).doctor();
    const image = await run("docker", [
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      p.profile.image,
    ]);
    if (image.code !== 0) throw new Error("Sandbox image is unavailable");
    output(p.profile);
    line("IMAGE DIGEST", image.stdout.trim());
    if (
      !opts.acceptProfile &&
      (
        await ask(
          "Allow this exact command profile to run in isolated Docker containers? [y/N]",
        )
      ).toLowerCase() !== "y"
    )
      return;
    const mappings = await loadMappings();
    const next = [
      ...mappings.filter((m) => m.projectId !== id),
      {
        projectId: id,
        path: path.resolve(folder),
        profileDigest: hash(p.profile),
        imageId: image.stdout.trim(),
      },
    ];
    await mkdir(runnerRoot(), { recursive: true });
    await writeFile(
      path.join(runnerRoot(), "mappings.json"),
      JSON.stringify(next, null, 2),
    );
    success("Repository mapping saved.");
  });
runner
  .command("start")
  .option("--once", "Lease at most one job and exit")
  .action(async (opts) => {
    const r = new Runner(
      new Client(client().url, undefined, "runner"),
      await loadMappings(),
    );
    process.once("SIGINT", () => r.stop());
    process.once("SIGTERM", () => r.stop());
    await r.start(opts.once);
  });
runner
  .command("quarantine-clean <job>")
  .description(
    "Stop named containers after a crash; retain workspaces for review",
  )
  .action(async (id) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Expected a job UUID");
    for (const name of [`shadowqa-${id}`, `shadowqa-${id}-check`]) {
      await run("docker", ["rm", "-f", name]);
      const state = await run("docker", ["inspect", name]);
      if (state.code === 0) throw new Error("Container still exists");
    }
    success(
      "Execution containers stopped. Inspect the old job, cancel it, and compile a fresh plan.",
    );
  });
cli
  .command("attach <job>")
  .description("Attach OpenCode TUI to the exact running sandbox session")
  .action(async (id) => {
    const raw = await new AsyncEntry("ShadowQA", `session:${id}`).getPassword();
    if (!raw)
      throw new AppError(
        "NO_SESSION",
        "No active session on this machine. Use job, logs or diff for completed jobs.",
      );
    const info = JSON.parse(raw);
    const exe = await opencodeExecutable();
    const child = spawn(
      exe,
      ["attach", info.url, "--session", info.sessionId, "--dir", "/workspace"],
      {
        stdio: "inherit",
        shell: false,
        windowsHide: false,
        env: { ...process.env, OPENCODE_SERVER_PASSWORD: info.password },
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => resolve());
    });
  });
cli
  .command("session <job>")
  .description("Show non-secret session binding for IDE controls")
  .action(async (id) => {
    const raw = await new AsyncEntry("ShadowQA", `session:${id}`).getPassword();
    if (!raw) throw new Error("No active local session");
    const { password, ...info } = JSON.parse(raw);
    output(info);
  });
const member = cli
  .command("member")
  .description("Manage authenticated membership");
member
  .command("add <id>")
  .option("--role <role>", "admin | developer | viewer", "developer")
  .option("--projects <ids>", "Comma-separated project IDs", "")
  .action(async (id, opts) =>
    output(
      await client().call("/members", "POST", {
        id,
        role: opts.role,
        projects: opts.projects.split(",").filter(Boolean),
      }),
    ),
  );
member
  .command("revoke <id>")
  .action(async (id) =>
    output(await client().call(`/members/${id}/revoke`, "POST", {})),
  );
cli
  .command("link <provider>")
  .description("Link Slack or GitHub through authenticated OAuth")
  .action(async (provider) => {
    const result = await client().call(`/identity/${provider}`, "POST", {});
    line("OPEN TO LINK", result.url);
  });
cli.command("audit").action(async () => output(await client().call("/audit")));
cli
  .command("queue")
  .option("--retry", "Retry failed inbox and outbound actions")
  .action(async (opts) =>
    output(
      await client().call(
        opts.retry ? "/queue/retry" : "/queue",
        opts.retry ? "POST" : "GET",
        opts.retry ? {} : undefined,
      ),
    ),
  );
cli
  .command("prune")
  .description("Apply source/artifact retention policy")
  .action(async () => output(await client().call("/retention", "POST", {})));
cli
  .command("doctor")
  .description("Check local dependencies, configuration, database and API")
  .action(async () => {
    const results: any[] = [];
    const check = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        results.push({ check: name, status: "PASS" });
      } catch (e: any) {
        results.push({
          check: name,
          status: "FAIL",
          reason: sanitize(e.message),
        });
      }
    };
    await check("Node >=22", async () => {
      if (Number(process.versions.node.split(".")[0]) < 22)
        throw new Error("Install Node 22 or newer");
    });
    await check("Git", async () => {
      if ((await run("git", ["--version"])).code !== 0)
        throw new Error("Install Git");
    });
    await check("PostgreSQL", async () =>
      dbAction((db) => db.rows("SELECT 1")),
    );
    await check("Service/auth", () => client().call("/me"));
    await check("Gemini key", async () => {
      if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY");
    });
    await check("OpenCode CLI", async () => {
      const r = await run(await opencodeExecutable(), ["--version"]);
      if (r.stdout.trim() !== "1.15.10")
        throw new Error(
          "Install opencode-ai@1.15.10 for matching IDE attachment",
        );
    });
    let config;
    try {
      config = await loadConfig();
    } catch (e) {
      results.push({
        check: "Configuration",
        status: "FAIL",
        reason: String(e),
      });
    }
    for (const p of config?.projects ?? []) {
      await check(`${p.id}: repository`, () => inspect(p));
      await check(`${p.id}: sandbox`, () =>
        new Sandbox("shadowqa-doctor", p.profile).doctor(),
      );
      await check(`${p.id}: profile`, async () => {
        if (!p.profile.reviewed || !p.profile.externalInferenceApproved)
          throw new Error("Review profile and Gemini data use");
      });
    }
    output(results);
    if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
  });
cli
  .command("ui")
  .description(
    "Interactive terminal command center (also works in IDE terminals)",
  )
  .action(async () => {
    while (true) {
      banner();
      const status = await client().call("/status");
      table(status.projects, ["id", "name", "mode"]);
      line("CONTEXT", `${status.sources} source documents`);
      console.log(
        "\n  1  Compile context, generate plan\n  2  Review / approve plans\n  3  Jobs and sessions\n  4  Findings\n  5  Change automation mode\n  6  Pause all work\n  7  What ShadowQA is watching\n  8  Connections (Slack, GitHub, mode)\n  0  Exit\n",
      );
      const choice = await ask("Choose →");
      if (choice === "0") break;
      if (choice === "1") {
        const id = await ask("Project ID:"),
          objective = await ask("Objective (Enter uses confirmed context):");
        renderPlan(
          await client().call(`/projects/${id}/compile`, "POST", { objective }),
        );
      }
      if (choice === "2") {
        output(await client().call("/plans"));
        const id = await ask("Plan ID to review (Enter to return):");
        if (id) await approve(id);
      }
      if (choice === "3") {
        output(await client().call("/jobs"));
        line("ATTACH", "shadowqa attach <job>");
      }
      if (choice === "4") output(await client().call("/findings"));
      if (choice === "5") {
        const id = await ask("Project ID:"),
          mode = await ask("observe / approval / auto-fix / full-auto:");
        output(await client().call(`/projects/${id}/mode`, "POST", { mode }));
      }
      if (choice === "6")
        output(await client().call("/control/kill", "POST", { enabled: true }));
      if (choice === "7") watchingSummary(await client().call("/status"));
      if (choice === "8") {
        const step = await ask(
          "Step (" + STEPS.join(" / ") + ", Enter for all):",
        );
        await setup(
          ask,
          secretPrompt,
          STEPS.includes(step as Step) ? (step as Step) : undefined,
        );
      }
      await ask("Press Enter to continue.");
    }
  });
async function secretPrompt(question: string): Promise<string> {
  if (!stdin.isTTY)
    throw new AppError(
      "INTERACTIVE",
      "Use SHADOWQA_TOKEN / SHADOWQA_RUNNER_TOKEN for headless execution",
    );
  stdout.write("  " + question + " ");
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
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
    const done = () => {
      stdin.off("data", listener);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    stdin.on("data", listener);
  });
}
async function opencodeExecutable() {
  if (process.env.SHADOWQA_OPENCODE_EXE)
    return process.env.SHADOWQA_OPENCODE_EXE;
  if (process.platform !== "win32") return "opencode";
  const base = path.join(process.env.APPDATA ?? "", "npm", "node_modules");
  for (const file of [
    path.join(
      base,
      "opencode-ai",
      "node_modules",
      "opencode-windows-x64",
      "bin",
      "opencode.exe",
    ),
    path.join(base, "opencode-windows-x64", "bin", "opencode.exe"),
  ]) {
    try {
      await access(file);
      return file;
    } catch {}
  }
  throw new AppError(
    "OPENCODE_PATH",
    "Set SHADOWQA_OPENCODE_EXE to the native opencode.exe installed by opencode-ai@1.15.10",
  );
}
cli.parseAsync().catch((e) => {
  if (cli.opts().json)
    console.error(
      JSON.stringify({ code: e.code ?? "ERROR", message: sanitize(e.message) }),
    );
  else failure(e.message);
  process.exitCode = 1;
});
