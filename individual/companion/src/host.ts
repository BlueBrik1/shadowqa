#!/usr/bin/env node
/**
 * The native messaging host. Chrome launches this process; it holds no state of its own and does
 * exactly one job: forward a small, fixed set of requests from the extension to the local
 * ShadowQA service, using a token the extension obtained by pairing.
 *
 * The extension never learns the owner token and never receives an arbitrary-URL fetch.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { serve } from "./native-messaging.js";
import { ServiceClient, localCredential } from "./client.js";
import { workRoot } from "../../core/execute.js";

const tokenStore = () => path.join(workRoot(), "extension-tokens.json");

async function readTokens(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(tokenStore(), "utf8"));
  } catch {
    return {};
  }
}

async function saveToken(extensionId: string, token: string) {
  const tokens = await readTokens();
  tokens[extensionId] = token;
  await mkdir(path.dirname(tokenStore()), { recursive: true });
  await writeFile(tokenStore(), JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

/** Only these operations are reachable from a browser extension. */
const ROUTES: Record<string, { method: string; path: (m: any) => string }> = {
  health: { method: "GET", path: () => "/health" },
  status: { method: "GET", path: () => "/status" },
  projects: { method: "GET", path: () => "/projects" },
  conversations: { method: "GET", path: () => "/conversations" },
  capture: { method: "POST", path: () => "/capture" },
  pause: {
    method: "POST",
    path: (m) => `/conversations/${encodeURIComponent(m.conversationId)}/pause`,
  },
  untrack: {
    method: "POST",
    path: (m) =>
      `/conversations/${encodeURIComponent(m.conversationId)}/untrack`,
  },
  forget: {
    method: "DELETE",
    path: (m) => `/conversations/${encodeURIComponent(m.conversationId)}`,
  },
  reportError: {
    method: "POST",
    path: (m) => `/conversations/${encodeURIComponent(m.conversationId)}/error`,
  },
  items: {
    method: "GET",
    path: (m) => `/projects/${encodeURIComponent(m.projectId)}/items`,
  },
  plans: {
    method: "GET",
    path: (m) => `/plans?projectId=${encodeURIComponent(m.projectId ?? "")}`,
  },
  tasks: {
    method: "GET",
    path: (m) => `/tasks?projectId=${encodeURIComponent(m.projectId ?? "")}`,
  },
  findings: {
    method: "GET",
    path: (m) => `/findings?projectId=${encodeURIComponent(m.projectId ?? "")}`,
  },
};

export async function handle(message: any) {
  const extensionId = String(message?.extensionId ?? "unknown").slice(0, 64);

  if (message?.type === "ping") {
    const credential = await localCredential().catch(() => undefined);
    const tokens = await readTokens();
    return {
      companion: "shadowqa-individual",
      serviceReachable: !!credential,
      paired: !!tokens[extensionId],
      url: credential?.url,
    };
  }

  if (message?.type === "pair") {
    const { url } = await localCredential().catch(async () => {
      throw new Error(
        "ShadowQA Individual is not running. Start it with: shadowqa-individual serve",
      );
    });
    const response = await new ServiceClient(url).call<{ token: string }>(
      "/pair/redeem",
      "POST",
      {
        code: String(message.code ?? ""),
        extensionId,
      },
    );
    await saveToken(extensionId, response.token);
    return { paired: true };
  }

  if (message?.type === "unpair") {
    const tokens = await readTokens();
    delete tokens[extensionId];
    await writeFile(tokenStore(), JSON.stringify(tokens, null, 2), {
      mode: 0o600,
    });
    return { paired: false };
  }

  const route = ROUTES[String(message?.type ?? "")];
  if (!route) throw new Error("Unsupported request: " + String(message?.type));

  const tokens = await readTokens();
  const token = tokens[extensionId];
  if (!token)
    throw Object.assign(
      new Error("This extension is not paired with ShadowQA Individual."),
      {
        code: "NOT_PAIRED",
      },
    );

  const client = await ServiceClient.local(token);
  const body =
    route.method === "GET" || route.method === "DELETE"
      ? undefined
      : (message.payload ?? {});
  return client.call(route.path(message), route.method, body);
}

const invokedDirectly =
  !!process.argv[1] && path.basename(process.argv[1]) === "host.js";

if (invokedDirectly || process.env.SHADOWQA_COMPANION_HOST === "1") {
  process.stdin.pause();
  process.stdin.resume();
  serve(handle).then(() => process.exit(0));
}
