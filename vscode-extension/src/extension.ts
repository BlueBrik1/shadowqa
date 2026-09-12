import * as vscode from "vscode";
import { execFile } from "node:child_process";
import path from "node:path";
type Item = {
  label: string;
  description?: string;
  icon?: string;
  command?: string;
  args?: unknown[];
  children?: Item[];
};
let channel: vscode.OutputChannel;
const settings = () => vscode.workspace.getConfiguration("shadowqa");
async function cliPath() {
  let value = settings().get<string>("cliPath");
  if (!value) {
    const files = await vscode.window.showOpenDialog({
      title: "Select ShadowQA dist/cli/main.js",
      canSelectMany: false,
      filters: { JavaScript: ["js"] },
    });
    if (!files?.[0]) throw new Error("Set shadowqa.cliPath to use ShadowQA");
    value = files[0].fsPath;
    await settings().update(
      "cliPath",
      value,
      vscode.ConfigurationTarget.Global,
    );
  }
  return value;
}
async function call(args: string[]): Promise<any> {
  const script = await cliPath();
  return new Promise((resolve, reject) =>
    execFile(
      settings().get("nodePath", "node"),
      [
        script,
        "--url",
        settings().get("serviceUrl", "http://127.0.0.1:4380"),
        "--json",
        ...args,
      ],
      {
        cwd: path.dirname(script),
        windowsHide: true,
        timeout: 250_000,
        maxBuffer: 4_000_000,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("CLI returned an invalid response"));
        }
      },
    ),
  );
}
async function terminal(args: string[]) {
  const script = await cliPath();
  const t = vscode.window.createTerminal({
    name: "◈ ShadowQA",
    shellPath: settings().get("nodePath", "node"),
    shellArgs: [
      script,
      "--url",
      settings().get("serviceUrl", "http://127.0.0.1:4380"),
      ...args,
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
        call(["status"]),
        call(["plans"]),
        call(["jobs"]),
        call(["findings"]),
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
          label: "Command center",
          icon: "terminal",
          command: "shadowqa.terminal",
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
                args: [["job", j.id]],
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
          label: "Setup / service unavailable",
          description: e.message,
          icon: "warning",
        },
        {
          label: "Open command center",
          command: "shadowqa.terminal",
          icon: "terminal",
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
      item.children
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    tree.description = item.description;
    tree.tooltip = item.description
      ? `${item.label}\n${item.description}`
      : item.label;
    if (item.icon) tree.iconPath = new vscode.ThemeIcon(item.icon);
    if (item.command)
      tree.command = {
        command: item.command,
        title: item.label,
        arguments: item.args,
      };
    return tree;
  }
  getChildren(item?: Item) {
    return item?.children ?? this.items;
  }
}
async function projectId(id?: string) {
  if (id) return id;
  const projects = await call(["project", "list"]);
  return (
    await vscode.window.showQuickPick<vscode.QuickPickItem>(
      projects.map((p: any) => ({ label: p.id, description: p.name })),
      { title: "ShadowQA project" },
    )
  )?.label;
}
export function activate(context: vscode.ExtensionContext) {
  channel = vscode.window.createOutputChannel("ShadowQA");
  context.subscriptions.push(channel);
  const control = new Control();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("shadowqa.control", control),
  );
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
  command("shadowqa.terminal", () => terminal(["ui"]));
  command("shadowqa.compile", async () => {
    const id = await projectId();
    if (!id) return;
    const objective = await vscode.window.showInputBox({
      title: "Compile context, generate plan",
      prompt: "Optional objective. Leave empty to compile confirmed context.",
    });
    if (objective === undefined) return;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "ShadowQA is compiling context",
      },
      async () => {
        const plan = await call(["compile", id, "--objective", objective]);
        await showJson(plan);
      },
    );
    await control.refresh();
  });
  command("shadowqa.approve", async (id?: string) => {
    if (!id) {
      const plans = await call(["plans"]);
      id = (
        await vscode.window.showQuickPick<vscode.QuickPickItem>(
          plans.map((p: any) => ({ label: p.id, description: p.objective })),
          { title: "Review plan" },
        )
      )?.label;
    }
    if (!id) return;
    const plan = await call(["plan", id]);
    await showJson(plan);
    const choice = await vscode.window.showInformationMessage(
      `Approve plan ${id.slice(0, 8)} at ${plan.baseSha.slice(0, 12)}?`,
      {
        modal: true,
        detail: `${plan.objective}\nDigest: ${plan.digest}\nCommand profile: ${plan.profileId}\nFiles: ${plan.expectedPaths.join(", ")}`,
      },
      "Approve",
    );
    if (choice === "Approve") await call(["approve", id, "--yes"]);
    await control.refresh();
  });
  command("shadowqa.attach", async (id?: string) => {
    if (!id) id = await vscode.window.showInputBox({ prompt: "Job ID" });
    if (!id) return;
    const session = await call(["session", id]);
    await terminal(["attach", id]);
    if (
      (await vscode.window.showInformationMessage(
        "Open the isolated agent workspace in a new editor window?",
        "Open workspace",
      )) === "Open workspace"
    )
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(session.workspace),
        true,
      );
  });
  command("shadowqa.diff", async (id: string) => {
    const artifact = await call(["diff", id]);
    const doc = await vscode.workspace.openTextDocument({
      content: artifact.diff,
      language: "diff",
    });
    await vscode.window.showTextDocument(doc, { preview: false });
  });
  command("shadowqa.cancel", async (id: string) => {
    await call(["cancel", id]);
    await control.refresh();
  });
  command("shadowqa.pause", async () => {
    await call(["pause"]);
    await control.refresh();
  });
  command("shadowqa.resume", async () => {
    await call(["resume"]);
    await control.refresh();
  });
  command("shadowqa.mode", async (id?: string) => {
    id = await projectId(id);
    if (!id) return;
    const mode = await vscode.window.showQuickPick(
      ["observe", "approval", "auto-fix", "full-auto"],
      { title: "Automation mode (invalidates existing approvals)" },
    );
    if (mode) {
      await call(["project", "mode", id, mode]);
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
    if (folder?.[0])
      await terminal(["watch", id, "--folder", folder[0].fsPath]);
  });
  command("shadowqa.details", async (args: string[]) =>
    showJson(await call(args)),
  );
  const diagnostics = vscode.languages.createDiagnosticCollection("shadowqa");
  context.subscriptions.push(diagnostics);
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/.shadowqa/diagnostics.json",
  );
  const refreshDiagnostics = async (uri: vscode.Uri) => {
    try {
      const report = JSON.parse(
        Buffer.from(await vscode.workspace.fs.readFile(uri)).toString(),
      );
      diagnostics.clear();
      if (report.stale) return;
      const root = vscode.Uri.file(path.dirname(path.dirname(uri.fsPath)));
      for (const result of report.results) {
        if (result.exitCode === 0) continue;
        for (const line of String(result.output).split("\n")) {
          const m =
            line.match(
              /(?:\/workspace\/)?([\w./-]+\.[jt]sx?)\((\d+),(\d+)\):\s*(.*)/,
            ) ||
            line.match(
              /(?:\/workspace\/)?([\w./-]+\.[jt]sx?):(\d+):(\d+)\s*(.*)/,
            );
          if (!m || m[1].includes("..") || path.isAbsolute(m[1])) continue;
          const file = vscode.Uri.joinPath(root, m[1]),
            d = new vscode.Diagnostic(
              new vscode.Range(
                Math.max(0, +m[2] - 1),
                Math.max(0, +m[3] - 1),
                Math.max(0, +m[2] - 1),
                Math.max(0, +m[3]),
              ),
              m[4] || result.id,
              vscode.DiagnosticSeverity.Warning,
            );
          d.source = "ShadowQA";
          diagnostics.set(file, [...(diagnostics.get(file) ?? []), d]);
        }
      }
    } catch {}
  };
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(refreshDiagnostics),
    watcher.onDidChange(refreshDiagnostics),
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!doc.uri.fsPath.includes(".shadowqa")) diagnostics.clear();
    }),
  );
  const timer = setInterval(
    () => void control.refresh(),
    settings().get<number>("refreshSeconds", 15) * 1000,
  );
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void control.refresh();
}
async function showJson(value: unknown) {
  const doc = await vscode.workspace.openTextDocument({
    content: JSON.stringify(value, null, 2),
    language: "json",
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}
export function deactivate() {}
