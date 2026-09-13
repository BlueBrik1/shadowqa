import * as vscode from "vscode";
import { access } from "node:fs/promises";
import { AsyncEntry } from "@napi-rs/keyring";
import path from "node:path";

/** Windows has no `opencode` on PATH — it needs the native binary the npm shim would otherwise
 * resolve. Set SHADOWQA_OPENCODE_EXE to override. */
async function opencodeExecutable(): Promise<string> {
  if (process.env.SHADOWQA_OPENCODE_EXE) return process.env.SHADOWQA_OPENCODE_EXE;
  if (process.platform !== "win32") return "opencode";
  const base = path.join(process.env.APPDATA ?? "", "npm", "node_modules");
  for (const file of [
    path.join(base, "opencode-ai", "node_modules", "opencode-windows-x64", "bin", "opencode.exe"),
    path.join(base, "opencode-windows-x64", "bin", "opencode.exe"),
  ]) {
    try {
      await access(file);
      return file;
    } catch {}
  }
  throw new Error("Set SHADOWQA_OPENCODE_EXE to the native opencode.exe installed by opencode-ai");
}
type Item = {
  label: string;
  description?: string;
  icon?: string;
  command?: string;
  args?: unknown[];
  children?: Item[];
};
let channel: vscode.OutputChannel;
let secrets: vscode.SecretStorage;
const settings = () => vscode.workspace.getConfiguration("shadowqa");
const TOKEN_KEY = "shadowqa.token";

async function token(force = false): Promise<string> {
  if (!force) {
    const existing = await secrets.get(TOKEN_KEY);
    if (existing) return existing;
  }
  const entered = await vscode.window.showInputBox({
    title: "ShadowQA API token",
    prompt: "A member or admin token for " + settings().get("serviceUrl"),
    password: true,
    ignoreFocusOut: true,
  });
  if (!entered) throw new Error("ShadowQA: no token entered");
  await secrets.store(TOKEN_KEY, entered);
  return entered;
}

/** The extension talks to the same REST API the desktop app and the old CLI used — a plain
 * bearer-authenticated fetch, nothing shelled out. */
async function call<T = any>(route: string, method = "GET", body?: unknown): Promise<T> {
  const url = String(settings().get("serviceUrl", "http://127.0.0.1:4380"));
  const run = async (bearer: string) =>
    fetch(url + route, {
      method,
      headers: { Authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  let response = await run(await token());
  if (response.status === 401) response = await run(await token(true));
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? `HTTP ${response.status}`);
  return result;
}

async function approvePlan(planId: string, digest: string, decision: "approve" | "reject") {
  const challenge = await call(`/plans/${planId}/challenge`, "POST", {});
  return call(`/plans/${planId}/approvals`, "POST", {
    approvalId: challenge.id,
    nonce: challenge.nonce,
    digest,
    decision,
  });
}

/** `attach`/`session`: the sandbox session binding never leaves the runner machine over the
 * network — it lives in the OS keyring, exactly as the runner itself wrote it. */
async function localSession(jobId: string) {
  const raw = await new AsyncEntry("ShadowQA", `session:${jobId}`).getPassword();
  if (!raw) throw new Error("No active session on this machine for that job.");
  return JSON.parse(raw) as { url: string; sessionId: string; password: string };
}

async function attachTerminal(jobId: string) {
  const info = await localSession(jobId);
  const exe = await opencodeExecutable();
  const t = vscode.window.createTerminal({
    name: "◈ ShadowQA session",
    shellPath: exe,
    shellArgs: ["attach", info.url, "--session", info.sessionId, "--dir", "/workspace"],
    env: { OPENCODE_SERVER_PASSWORD: info.password },
  });
  t.show();
}

async function watchTerminal(projectId: string, folder: string) {
  const script = path.resolve(__dirname, "..", "..", "scripts", "watch-project.ts");
  const t = vscode.window.createTerminal({
    name: "◈ ShadowQA watch",
    shellPath: process.platform === "win32" ? "npx.cmd" : "npx",
    shellArgs: [
      "tsx",
      script,
      "--url",
      String(settings().get("serviceUrl")),
      "--token",
      await token(),
      "--project",
      projectId,
      "--folder",
      folder,
    ],
  });
  t.show();
}

class Control implements vscode.TreeDataProvider<Item> {
  private emitter = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private items: Item[] = [];
  private busy = false;
  async refresh() {
    if (this.busy) return;
    this.busy = true;
    try {
      const [status, plans, jobs, findings] = await Promise.all([
        call("/status"),
        call("/plans"),
        call("/jobs"),
        call("/findings"),
      ]);
      this.items = [
        {
          label: status.killed ? "Workspace paused" : "Observation active",
          description: `${status.sources} sources`,
          icon: status.killed ? "debug-pause" : "eye",
        },
        {
          label: "Compile context, generate plan",
          icon: "sparkle",
          command: "shadowqa.compile",
        },
        {
          label: "Projects",
          children: status.projects.map((p: any) => ({
            label: p.name,
            description: p.mode,
            icon: "repo",
            command: "shadowqa.mode",
            args: [p.id],
          })),
        },
        {
          label: "Plans",
          children: plans.map((p: any) => ({
            label: p.objective,
            description: p.status,
            icon: "checklist",
            command: "shadowqa.approve",
            args: [p.id],
          })),
        },
        {
          label: "Jobs",
          children: jobs.map((j: any) => ({
            label: j.id.slice(0, 8),
            description: j.state,
            icon: j.state === "running" ? "play" : "history",
            children: [
              {
                label: "Open agent session",
                command: "shadowqa.attach",
                args: [j.id],
                icon: "terminal",
              },
              {
                label: "Show verified diff",
                command: "shadowqa.diff",
                args: [j.id],
                icon: "diff",
              },
              {
                label: "Details and logs",
                command: "shadowqa.details",
                args: [["jobs", j.id]],
                icon: "output",
              },
              {
                label: "Cancel",
                command: "shadowqa.cancel",
                args: [j.id],
                icon: "debug-stop",
              },
            ],
          })),
        },
        {
          label: "Findings",
          children: findings.map((f: any) => ({
            label: f.rule,
            description: f.classification + " · " + f.state,
            icon: "warning",
            command: "shadowqa.details",
            args: [["findings"]],
          })),
        },
        {
          label: "Observation health",
          children: status.connections.map((c: any) => ({
            label: c.provider,
            description: c.gap ? "History gap / degraded" : c.lastSuccess,
            icon: c.gap ? "warning" : "pass",
          })),
        },
      ];
    } catch (e: any) {
      this.items = [
        {
          label: "Not connected",
          description: e.message,
          icon: "warning",
        },
        {
          label: "Set API token",
          command: "shadowqa.setToken",
          icon: "key",
        },
      ];
    } finally {
      this.busy = false;
      this.emitter.fire(undefined);
    }
  }
  getTreeItem(item: Item) {
    const tree = new vscode.TreeItem(
      item.label,
      item.children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    tree.description = item.description;
    tree.tooltip = item.description ? `${item.label}\n${item.description}` : item.label;
    if (item.icon) tree.iconPath = new vscode.ThemeIcon(item.icon);
    if (item.command) tree.command = { command: item.command, title: item.label, arguments: item.args };
    return tree;
  }
  getChildren(item?: Item) {
    return item?.children ?? this.items;
  }
}
async function projectId(id?: string) {
  if (id) return id;
  const projects = await call("/projects");
  return (
    await vscode.window.showQuickPick<vscode.QuickPickItem>(
      projects.map((p: any) => ({ label: p.id, description: p.name })),
      { title: "ShadowQA project" },
    )
  )?.label;
}
export function activate(context: vscode.ExtensionContext) {
  channel = vscode.window.createOutputChannel("ShadowQA");
  secrets = context.secrets;
  context.subscriptions.push(channel);
  const control = new Control();
  context.subscriptions.push(vscode.window.registerTreeDataProvider("shadowqa.control", control));
  const command = (name: string, fn: (...args: any[]) => Promise<unknown>) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(name, async (...args: any[]) => {
        try {
          await fn(...args);
        } catch (e: any) {
          vscode.window.showErrorMessage("ShadowQA: " + e.message);
        }
      }),
    );
  command("shadowqa.refresh", () => control.refresh());
  command("shadowqa.setToken", async () => {
    await token(true);
    await control.refresh();
  });
  command("shadowqa.compile", async () => {
    const id = await projectId();
    if (!id) return;
    const objective = await vscode.window.showInputBox({
      title: "Compile context, generate plan",
      prompt: "Optional objective. Leave empty to compile confirmed context.",
    });
    if (objective === undefined) return;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "ShadowQA is compiling context" },
      async () => {
        const plan = await call(`/projects/${id}/compile`, "POST", { objective });
        await showJson(plan);
      },
    );
    await control.refresh();
  });
  command("shadowqa.approve", async (id?: string) => {
    if (!id) {
      const plans = await call("/plans");
      id = (
        await vscode.window.showQuickPick<vscode.QuickPickItem>(
          plans.map((p: any) => ({ label: p.id, description: p.objective })),
          { title: "Review plan" },
        )
      )?.label;
    }
    if (!id) return;
    const plan = await call(`/plans/${id}`);
    await showJson(plan);
    const choice = await vscode.window.showInformationMessage(
      `Approve plan ${id.slice(0, 8)} at ${plan.baseSha.slice(0, 12)}?`,
      {
        modal: true,
        detail: `${plan.objective}\nDigest: ${plan.digest}\nFiles: ${plan.expectedPaths.join(", ")}`,
      },
      "Approve",
    );
    if (choice === "Approve") await approvePlan(id, plan.digest, "approve");
    await control.refresh();
  });
  command("shadowqa.attach", async (id?: string) => {
    if (!id) id = await vscode.window.showInputBox({ prompt: "Job ID" });
    if (!id) return;
    await attachTerminal(id);
  });
  command("shadowqa.diff", async (id: string) => {
    const artifacts = await call(`/jobs/${id}/artifacts`);
    const diff = artifacts.find((a: any) => a.kind === "diff");
    const doc = await vscode.workspace.openTextDocument({ content: diff?.content ?? "No diff yet.", language: "diff" });
    await vscode.window.showTextDocument(doc, { preview: false });
  });
  command("shadowqa.cancel", async (id: string) => {
    await call(`/jobs/${id}/cancel`, "POST", {});
    await control.refresh();
  });
  command("shadowqa.pause", async () => {
    await call("/control/kill", "POST", { enabled: true });
    await control.refresh();
  });
  command("shadowqa.resume", async () => {
    await call("/control/kill", "POST", { enabled: false });
    await control.refresh();
  });
  command("shadowqa.mode", async (id?: string) => {
    id = await projectId(id);
    if (!id) return;
    const mode = await vscode.window.showQuickPick(["observe", "approval", "auto-fix", "full-auto"], {
      title: "Automation mode (invalidates existing approvals)",
    });
    if (mode) {
      await call(`/projects/${id}/mode`, "POST", { mode });
      await control.refresh();
    }
  });
  command("shadowqa.watch", async () => {
    const id = await projectId();
    if (!id) return;
    const folder = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      title: "Consent to observing saved files in this folder",
    });
    if (folder?.[0]) await watchTerminal(id, folder[0].fsPath);
  });
  command("shadowqa.details", async (args: [string, ...string[]]) => showJson(await call("/" + args.join("/"))));
  const diagnostics = vscode.languages.createDiagnosticCollection("shadowqa");
  context.subscriptions.push(diagnostics);
  const watcher = vscode.workspace.createFileSystemWatcher("**/.shadowqa/diagnostics.json");
  const refreshDiagnostics = async (uri: vscode.Uri) => {
    try {
      const report = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString());
      diagnostics.clear();
      if (report.stale) return;
      const root = vscode.Uri.file(path.dirname(path.dirname(uri.fsPath)));
      for (const result of report.results) {
        if (result.exitCode === 0) continue;
        for (const line of String(result.output).split("\n")) {
          const m =
            line.match(/(?:\/workspace\/)?([\w./-]+\.[jt]sx?)\((\d+),(\d+)\):\s*(.*)/) ||
            line.match(/(?:\/workspace\/)?([\w./-]+\.[jt]sx?):(\d+):(\d+)\s*(.*)/);
          if (!m || m[1].includes("..") || path.isAbsolute(m[1])) continue;
          const file = vscode.Uri.joinPath(root, m[1]),
            d = new vscode.Diagnostic(
              new vscode.Range(Math.max(0, +m[2] - 1), Math.max(0, +m[3] - 1), Math.max(0, +m[2] - 1), Math.max(0, +m[3])),
              m[4] || result.id,
              vscode.DiagnosticSeverity.Warning,
            );
          d.source = "ShadowQA";
          diagnostics.set(file, [...(diagnostics.get(file) ?? []), d]);
        }
      }
    } catch {}
  };
  context.subscriptions.push(watcher, watcher.onDidCreate(refreshDiagnostics), watcher.onDidChange(refreshDiagnostics));
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!doc.uri.fsPath.includes(".shadowqa")) diagnostics.clear();
    }),
  );
  const timer = setInterval(() => void control.refresh(), settings().get<number>("refreshSeconds", 15) * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void control.refresh();
}
async function showJson(value: unknown) {
  const doc = await vscode.workspace.openTextDocument({ content: JSON.stringify(value, null, 2), language: "json" });
  await vscode.window.showTextDocument(doc, { preview: false });
}
export function deactivate() {}
