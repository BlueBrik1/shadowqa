import type { CheckResult, Profile, Command } from "../core/contracts.js";
import { AppError, sanitize } from "../core/security.js";
import { run } from "./process.js";
export const OPENCODE_VERSION = "1.15.10";
export class Sandbox {
  constructor(
    public name: string,
    private profile: Profile,
  ) {
    if (!/^shadowqa-[a-z0-9-]+$/.test(name))
      throw new Error("Invalid sandbox name");
  }
  async doctor() {
    const info = await run("docker", ["info", "--format", "{{.OSType}}"], {
      timeoutMs: 15_000,
    });
    if (info.code !== 0 || info.stdout.trim() !== "linux")
      throw new AppError(
        "SANDBOX_UNAVAILABLE",
        "Start Docker Desktop with Linux containers before running jobs",
      );
    const image = await run(
      "docker",
      ["image", "inspect", this.profile.image],
      { timeoutMs: 10_000 },
    );
    if (image.code !== 0)
      throw new AppError(
        "SANDBOX_IMAGE",
        `Build the reviewed sandbox image ${this.profile.image} first`,
      );
  }
  private flags(workspace: string) {
    return [
      "--name",
      this.name,
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      `${this.profile.memoryMb}m`,
      "--cpus",
      String(this.profile.cpus),
      "--user",
      "1000:1000",
      "--tmpfs",
      "/tmp:rw,nosuid,size=256m",
      "--tmpfs",
      "/home/node/.local:rw,uid=1000,gid=1000,size=256m",
      "--mount",
      `type=bind,src=${workspace},dst=/workspace`,
      "--mount",
      `type=bind,src=${workspace}/.git,dst=/workspace/.git,readonly`,
      "--workdir",
      "/workspace",
    ];
  }
  async start(
    workspace: string,
    bridge: string,
    password: string,
    model: string,
  ) {
    const config = {
      model: `google/${model}`,
      small_model: `google/${model}`,
      share: "disabled",
      autoupdate: false,
      provider: {
        google: {
          options: {
            apiKey: "shadowqa-bridge-no-credential",
            baseURL: "http://127.0.0.1:3001/v1beta",
          },
        },
      },
      permission: {
        "*": "deny",
        read: "allow",
        edit: "allow",
        glob: "allow",
        grep: "allow",
        todowrite: "allow",
        bash: "deny",
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
        external_directory: "deny",
      },
      plugin: [],
      mcp: {},
      formatter: false,
      lsp: false,
    };
    const env = {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    };
    const mounts = ["api-in", "api-out", "model-in", "model-out"].flatMap(
      (dir) => ["--mount", `type=bind,src=${bridge}/${dir},dst=/bridge/${dir}`],
    );
    const result = await run(
      "docker",
      [
        "run",
        "-d",
        ...this.flags(workspace),
        ...mounts,
        "-e",
        "OPENCODE_SERVER_PASSWORD",
        "-e",
        "OPENCODE_CONFIG_CONTENT",
        this.profile.image,
      ],
      { env, timeoutMs: 30_000 },
    );
    if (result.code !== 0)
      throw new AppError("SANDBOX_START", sanitize(result.stderr));
  }
  async checks(
    workspace: string,
    signal?: AbortSignal,
  ): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const command of [...this.profile.install, ...this.profile.checks]) {
      if (signal?.aborted) throw new AppError("CANCELLED", "Job cancelled");
      const result = await this.command(workspace, command, signal);
      results.push(result);
      if (this.profile.install.includes(command) && result.exitCode !== 0)
        break;
    }
    return results;
  }
  private async command(
    workspace: string,
    command: Command,
    signal?: AbortSignal,
  ): Promise<CheckResult> {
    const result = await run(
      "docker",
      [
        "run",
        "--rm",
        ...this.flags(workspace),
        this.profile.image,
        ...command.argv,
      ],
      { timeoutMs: command.timeoutSeconds * 1000, signal },
    );
    // Killing the Docker client does not kill its container. Always remove the named process group.
    await this.stop();
    return {
      id: command.id,
      exitCode: result.code,
      output: sanitize(result.stdout + "\n" + result.stderr).slice(-100_000),
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    };
  }
  async stop() {
    await run("docker", ["rm", "-f", this.name], { timeoutMs: 15_000 }).catch(
      () => {},
    );
  }
}
