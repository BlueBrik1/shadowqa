import http from "node:http";
import {
  mkdir,
  readdir,
  writeFile,
  rename,
  unlink,
  lstat,
  open,
  constants,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AppError, equal } from "../core/security.js";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function atomic(file: string, value: unknown) {
  const temp = file + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(value), { flag: "wx", mode: 0o666 });
  await rename(temp, file);
}
async function readSafe(file: string, max: number) {
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > max)
      throw new Error("Invalid bridge file");
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}
export class SandboxBridge {
  private server?: http.Server;
  private stopRequested = false;
  private polling?: Promise<void>;
  constructor(
    private root: string,
    private password: string,
    private model: (
      path: string,
      body: string,
    ) => Promise<{ status: number; contentType: string; body: string }>,
  ) {}
  async start() {
    for (const p of ["api-in", "api-out", "model-in", "model-out"])
      await mkdir(path.join(this.root, p), { recursive: true, mode: 0o777 });
    const authorization =
      "Basic " + Buffer.from(`opencode:${this.password}`).toString("base64");
    this.server = http.createServer(async (req, res) => {
      if (!equal(req.headers.authorization ?? "", authorization)) {
        res
          .writeHead(401, { "WWW-Authenticate": 'Basic realm="ShadowQA"' })
          .end();
        return;
      }
      if (req.headers.origin) {
        res.writeHead(403).end();
        return;
      }
      if (
        !/^\/(?:global\/(?:health|event)|event|session(?:[/?]|$)|config(?:[/?]|$)|provider(?:[/?]|$)|project(?:[/?]|$)|path(?:[/?]|$)|vcs(?:[/?]|$)|file(?:[/?]|$)|find(?:[/?]|$)|agent(?:[/?]|$)|command(?:[/?]|$)|permission(?:[/?]|$)|question(?:[/?]|$)|lsp(?:[/?]|$)|formatter(?:[/?]|$)|mcp(?:[/?]|$)|log(?:[/?]|$)|tui(?:[/?]|$)|experimental(?:[/?]|$))/.test(
          req.url ?? "",
        )
      ) {
        res.writeHead(403).end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2_000_000) {
          res.writeHead(413).end();
          return;
        }
      }
      const id = randomUUID();
      await atomic(path.join(this.root, "api-in", id + ".json"), {
        id,
        method: req.method,
        path: req.url,
        body,
      });
      let sequence = 0;
      const deadline = Date.now() + 3600_000;
      try {
        while (!this.stopRequested && !res.destroyed && Date.now() < deadline) {
          const file = path.join(
            this.root,
            "api-out",
            `${id}.${sequence}.json`,
          );
          try {
            const stat = await lstat(file);
            if (stat.isSymbolicLink() || stat.size > 4_000_000)
              throw new AppError("BRIDGE", "Invalid bridge response");
            const value = JSON.parse(await readSafe(file, 4_000_000));
            await unlink(file);
            sequence++;
            if (value.status)
              res.writeHead(value.status, {
                "content-type": value.contentType ?? "application/json",
              });
            if (value.chunk) res.write(Buffer.from(value.chunk, "base64"));
            if (value.error && !res.headersSent) res.writeHead(502);
            if (value.done) {
              res.end();
              return;
            }
          } catch (e: any) {
            if (e.code !== "ENOENT") throw e;
            await sleep(40);
          }
        }
        res.end();
      } catch {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    this.polling = this.pollModels();
    return `http://127.0.0.1:${(this.server.address() as any).port}`;
  }
  private async pollModels() {
    while (!this.stopRequested) {
      for (const file of await readdir(path.join(this.root, "model-in"))) {
        if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
        const full = path.join(this.root, "model-in", file);
        let reply: { status: number; contentType: string; body: string };
        try {
          const stat = await lstat(full);
          if (stat.isSymbolicLink() || stat.size > 2_100_000)
            throw new Error("Invalid model request");
          const request = JSON.parse(await readSafe(full, 2_100_000));
          await unlink(full);
          if (file !== request.id + ".json" || typeof request.body !== "string")
            throw new Error("Invalid model envelope");
          reply = await this.model(request.path, request.body);
        } catch (error: any) {
          reply = {
            status: error.status === 429 ? 429 : 502,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: error.status === 429 ? 429 : 502,
                message:
                  error.status === 429
                    ? "Gemini quota paused"
                    : "ShadowQA model request failed",
              },
            }),
          };
          await unlink(full).catch(() => {});
        }
        await atomic(path.join(this.root, "model-out", file), reply);
      }
      await sleep(100);
    }
  }
  async stop() {
    this.stopRequested = true;
    this.server?.closeAllConnections();
    await new Promise<void>((r) => {
      if (this.server) this.server.close(() => r());
      else r();
    });
    await this.polling;
  }
}
