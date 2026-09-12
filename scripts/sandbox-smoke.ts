import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fixture } from "./fixture.js";
import { project } from "../tests/helpers.js";
import { exportTree } from "../src/runner/workspace.js";
import { Sandbox } from "../src/runner/sandbox.js";
import { SandboxBridge } from "../src/runner/bridge.js";
import { OpenCode } from "../src/runner/opencode.js";
import { run, git } from "../src/runner/process.js";
import { token } from "../src/core/security.js";
const { repo, sha } = await fixture(),
  root = await mkdtemp(path.resolve(".shadowqa/sandbox-smoke-")),
  work = path.join(root, "work"),
  p = project();
await exportTree(repo, sha, work);
const sandbox = new Sandbox("shadowqa-smoke-" + Date.now(), p.profile),
  password = token();
let modelCalls = 0;
const bridge = new SandboxBridge(
  path.join(root, "bridge"),
  password,
  async (_route, body) => {
    JSON.parse(body);
    modelCalls++;
    const part =
      modelCalls === 1
        ? {
            functionCall: {
              name: "read",
              args: { filePath: "/workspace/src/submit.js" },
            },
          }
        : modelCalls === 2
          ? {
              functionCall: {
                name: "edit",
                args: {
                  filePath: "/workspace/src/submit.js",
                  oldString:
                    "// Planted regression: the in-flight guard is never set.",
                  newString: "pending = true;",
                },
              },
            }
          : { text: "The fixture guard is updated." };
    const response = {
      candidates: [
        {
          index: 0,
          content: { role: "model", parts: [part] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 10,
        totalTokenCount: 20,
      },
    };
    return {
      status: 200,
      contentType: "text/event-stream",
      body: "data: " + JSON.stringify(response) + "\n\n",
    };
  },
);
try {
  await sandbox.doctor();
  const url = await bridge.start();
  await sandbox.start(
    work,
    path.join(root, "bridge"),
    password,
    "gemini-2.5-flash",
  );
  const agent = new OpenCode(url, password);
  await agent.ready();
  const session = await agent.create("ShadowQA real OpenCode contract smoke");
  console.log(
    "PASS: authenticated OpenCode health and SDK session creation",
    session,
  );
  const unauth = await fetch(url + "/global/health");
  if (unauth.status !== 401)
    throw new Error("Unauthenticated loopback access succeeded");
  console.log("PASS: loopback authentication");
  const result = await run("docker", [
    "inspect",
    sandbox.name,
    "--format",
    "{{json .HostConfig}}",
  ]);
  const host = JSON.parse(result.stdout);
  if (
    host.NetworkMode !== "none" ||
    !host.ReadonlyRootfs ||
    !host.CapDrop.includes("ALL")
  )
    throw new Error("Sandbox isolation flags missing");
  const uid = await run("docker", ["exec", sandbox.name, "id", "-u"]);
  if (uid.stdout.trim() !== "1000") throw new Error("Sandbox is not non-root");
  const secret = await run("docker", [
    "exec",
    sandbox.name,
    "node",
    "-e",
    "if(process.env.GEMINI_API_KEY||process.env.GITHUB_APP_ID||process.env.SLACK_BOT_TOKEN)process.exit(1)",
  ]);
  if (secret.code !== 0) throw new Error("Trusted credentials reached sandbox");
  console.log(
    "PASS: no network, non-root, read-only root, no trusted credentials",
  );
  const checker = new Sandbox(sandbox.name + "-check", p.profile);
  const before = await checker.checks(work);
  if (before.every((c) => c.exitCode === 0))
    throw new Error("Planted regression did not fail");
  await agent.prompt(
    session,
    "Read src/submit.js, then replace the planted regression comment with pending = true;. Make no other changes. This is an offline contract fixture.",
    "gemini-2.5-flash",
    AbortSignal.timeout(90_000),
    async (text) => console.log("OpenCode:", text),
  );
  if (
    !(await readFile(path.join(work, "src/submit.js"), "utf8")).includes(
      "pending = true;",
    )
  )
    throw new Error("OpenCode did not apply the model tool call");
  const diff = await git(work, ["diff", "--no-ext-diff"]);
  const verify = path.join(root, "verify");
  await exportTree(repo, sha, verify);
  await git(verify, ["apply", "-"], { input: diff });
  const after = await checker.checks(verify);
  if (after.some((c) => c.exitCode !== 0))
    throw new Error("Independent sandbox verification failed");
  console.log(
    "PASS: real OpenCode file tools, file-based model transport, and independent Docker regression verification; scripted Gemini responses:",
    modelCalls,
  );
  await agent.abort(session);
  console.log("PASS: exact-session cancellation");
  if ((await git(repo, ["status", "--porcelain"])).trim())
    throw new Error("Original worktree changed");
} finally {
  console.log(
    (
      await run("docker", ["logs", sandbox.name], { maxOutput: 100000 })
    ).stderr.slice(-3000),
  );
  await sandbox.stop();
  await bridge.stop();
}
console.log(
  "Sandbox contract smoke passed. Gemini responses were scripted; no external Gemini request was made.",
);
