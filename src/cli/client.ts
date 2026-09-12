import { AsyncEntry } from "@napi-rs/keyring";
import { AppError, requireTransport } from "../core/security.js";
export const credentialKey = (url: string, kind = "user") =>
  new AsyncEntry("ShadowQA", `${kind}:${url}`);
export async function credential(url: string, kind = "user") {
  const env =
    kind === "runner"
      ? process.env.SHADOWQA_RUNNER_TOKEN
      : process.env.SHADOWQA_TOKEN;
  if (env) return env;
  try {
    const value = await credentialKey(url, kind).getPassword();
    if (value) return value;
  } catch {}
  throw new AppError(
    "LOGIN_REQUIRED",
    `No ${kind} credential. Run shadowqa login${kind === "runner" ? " --runner" : ""}.`,
  );
}
export class Client {
  constructor(
    public url = process.env.SHADOWQA_URL ?? "http://127.0.0.1:4380",
    private raw?: string,
    private kind = "user",
  ) {
    requireTransport(url);
  }
  async call<T = any>(
    route: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(this.url + route, {
      method,
      headers: {
        Authorization: `Bearer ${this.raw ?? (await credential(this.url, this.kind))}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(
        route.includes("/compile") ? 240_000 : 120_000,
      ),
    });
    const result: any = await response.json();
    if (!response.ok)
      throw new AppError(
        result.code ?? "API",
        result.message ?? `HTTP ${response.status}`,
        response.status,
      );
    return result;
  }
}
