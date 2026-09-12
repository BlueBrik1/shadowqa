import { createOpencodeClient } from "@opencode-ai/sdk/client";
import { AppError } from "../core/security.js";
import { OPENCODE_VERSION } from "./sandbox.js";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class OpenCode {
  private client: ReturnType<typeof createOpencodeClient>;
  constructor(
    public url: string,
    private password: string,
  ) {
    this.client = createOpencodeClient({
      baseUrl: url,
      directory: "/workspace",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`opencode:${password}`).toString("base64"),
      },
      fetch: async (request: Request) =>
        fetch(request, { signal: AbortSignal.timeout(15_000) }),
    });
  }
  async ready(signal?: AbortSignal) {
    let last = "";
    for (let i = 0; i < 60; i++) {
      if (signal?.aborted) throw new AppError("CANCELLED", "Job cancelled");
      try {
        const r = await fetch(this.url + "/global/health", {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`opencode:${this.password}`).toString("base64"),
          },
          signal: AbortSignal.timeout(2000),
        });
        if (r.ok) {
          const health: any = await r.json();
          if (health.version !== OPENCODE_VERSION)
            throw new AppError(
              "OPENCODE_VERSION",
              `Expected OpenCode ${OPENCODE_VERSION}; received ${health.version}`,
            );
          return;
        }
      } catch (e: any) {
        if (e.code === "OPENCODE_VERSION") throw e;
        last = e.message;
      }
      await sleep(500);
    }
    throw new AppError(
      "OPENCODE_START",
      "OpenCode did not become healthy: " + last,
    );
  }
  async create(title: string) {
    const result = await this.client.session.create({
      body: { title },
      throwOnError: true,
    });
    if (!result.data?.id)
      throw new AppError(
        "OPENCODE_CONTRACT",
        "Session creation returned no ID",
      );
    return result.data.id;
  }
  async prompt(
    sessionId: string,
    text: string,
    model: string,
    signal: AbortSignal,
    onProgress: (text: string) => Promise<void>,
  ) {
    const before = await this.client.session.messages({
      path: { id: sessionId },
      throwOnError: true,
    });
    const seen = new Set((before.data ?? []).map((m) => m.info.id));
    await this.client.session.promptAsync({
      path: { id: sessionId },
      body: {
        model: { providerID: "google", modelID: model },
        parts: [{ type: "text", text }],
      },
      throwOnError: true,
    });
    const reported = new Set<string>();
    while (!signal.aborted) {
      const [status, messages] = await Promise.all([
        this.client.session.status({ throwOnError: true }),
        this.client.session.messages({
          path: { id: sessionId },
          throwOnError: true,
        }),
      ]);
      const fresh = (messages.data ?? []).filter((m) => !seen.has(m.info.id));
      for (const m of fresh) {
        for (const part of m.parts) {
          if (
            part.type === "text" &&
            !reported.has(part.id) &&
            m.info.role === "assistant"
          ) {
            reported.add(part.id);
            await onProgress(part.text.slice(0, 2000));
          }
        }
      }
      const completed = fresh.findLast(
        (m) => m.info.role === "assistant" && m.info.time.completed,
      );
      if (
        completed &&
        (!status.data?.[sessionId] || status.data[sessionId].type === "idle")
      ) {
        if (completed.info.role === "assistant" && completed.info.error) {
          const error = completed.info.error;
          throw new AppError(
            JSON.stringify(error).includes("429")
              ? "QUOTA_PAUSED"
              : "OPENCODE_FAILED",
            "OpenCode session failed: " + error.name,
          );
        }
        return;
      }
      await sleep(1000);
    }
    await this.abort(sessionId);
    throw new AppError("CANCELLED", "OpenCode session cancelled");
  }
  async abort(id: string) {
    await this.client.session
      .abort({ path: { id }, throwOnError: true })
      .catch(() => {});
  }
}
