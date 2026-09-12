import { readFile } from "node:fs/promises";
import { AppError } from "../../../src/core/security.js";
import { endpointFile, ownerTokenFile } from "../../service/auth.js";

export type Credential = { url: string; token: string };

/** Reads the service endpoint and the caller's token from the companion's own home. */
export async function localCredential(token?: string): Promise<Credential> {
  let url: string;
  try {
    url = JSON.parse(await readFile(endpointFile(), "utf8")).url;
  } catch {
    throw new AppError(
      "SERVICE_OFFLINE",
      "ShadowQA Individual is not running. Start it with: shadowqa-individual serve",
      503,
    );
  }
  if (token) return { url, token };
  try {
    return { url, token: (await readFile(ownerTokenFile(), "utf8")).trim() };
  } catch {
    throw new AppError(
      "NO_CREDENTIAL",
      "No local credential. Run: shadowqa-individual serve",
      503,
    );
  }
}

export class ServiceClient {
  constructor(
    public url: string,
    private token?: string,
  ) {}

  static async local(token?: string) {
    const credential = await localCredential(token);
    return new ServiceClient(credential.url, credential.token);
  }

  async call<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(this.url + path, {
      method,
      headers: {
        ...(this.token ? { authorization: "Bearer " + this.token } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    }).catch((e) => {
      throw new AppError(
        "SERVICE_OFFLINE",
        "Cannot reach ShadowQA Individual at " +
          this.url +
          " (" +
          String(e?.message ?? e) +
          ")",
        503,
      );
    });
    const text = await response.text();
    const payload = text ? safeJson(text) : undefined;
    if (!response.ok)
      throw new AppError(
        payload?.code ?? "HTTP_" + response.status,
        payload?.message ?? (text.slice(0, 300) || response.statusText),
        response.status,
      );
    return payload as T;
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}
