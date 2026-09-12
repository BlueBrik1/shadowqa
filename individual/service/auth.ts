import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { hash, token, AppError, equal } from "../../src/core/security.js";
import { workRoot } from "../core/execute.js";
import type { Store } from "../core/store.js";

export type Caller = { role: "owner" | "extension"; id: string };

export const ownerTokenFile = () => path.join(workRoot(), "owner.token");
export const endpointFile = () => path.join(workRoot(), "endpoint.json");

/** The owner token is the CLI's credential; the companion reads the same file to reach the service. */
export async function ownerToken() {
  const file = ownerTokenFile();
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing) return existing;
  } catch {
    /* first run */
  }
  const created = token();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, created + "\n", { mode: 0o600 });
  await chmod(file, 0o600).catch(() => {});
  return created;
}

export async function writeEndpoint(url: string) {
  await mkdir(workRoot(), { recursive: true });
  await writeFile(
    endpointFile(),
    JSON.stringify(
      { url, pid: process.pid, since: new Date().toISOString() },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

export async function readEndpoint(): Promise<
  { url: string; pid: number } | undefined
> {
  try {
    return JSON.parse(await readFile(endpointFile(), "utf8"));
  } catch {
    return undefined;
  }
}

const PAIRING = "pairing";

/**
 * Pairing: the CLI mints a short code the user reads out of their terminal and types into the
 * side panel. The companion exchanges it once for a long-lived extension token. A code that is
 * not used within its window is worthless, and it is never transmitted by the extension again.
 *
 * Redemption is unauthenticated by design — the code the user typed is the credential — so a
 * wrong guess has to cost something.
 */
const MAX_PAIRING_ATTEMPTS = 5;

type Pairing = {
  codeHash: string;
  expiresAt: string;
  used: boolean;
  attempts: number;
};

export async function createPairingCode(store: Store, minutes = 10) {
  const code = token()
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
  await store.setControl(PAIRING, {
    codeHash: hash(code),
    expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    used: false,
    attempts: 0,
  } satisfies Pairing);
  return { code, expiresInMinutes: minutes };
}

export async function redeemPairingCode(
  store: Store,
  code: string,
  extensionId: string,
) {
  const pending = await store.control<Pairing>(PAIRING);
  if (!pending || pending.used)
    throw new AppError(
      "PAIRING",
      "No pairing is in progress. Run: shadowqa-individual pair",
      409,
    );
  if (Date.parse(pending.expiresAt) < Date.now())
    throw new AppError(
      "PAIRING",
      "That pairing code expired. Run: shadowqa-individual pair",
      409,
    );
  if (!equal(hash(String(code).trim().toUpperCase()), pending.codeHash)) {
    const attempts = (pending.attempts ?? 0) + 1;
    const exhausted = attempts >= MAX_PAIRING_ATTEMPTS;
    await store.setControl(PAIRING, { ...pending, attempts, used: exhausted });
    throw new AppError(
      "PAIRING",
      exhausted
        ? "Too many wrong codes; this pairing was cancelled. Run: shadowqa-individual pair"
        : "Pairing code does not match",
      403,
    );
  }
  const issued = token();
  await store.setControl(PAIRING, { ...pending, used: true });
  const clients = (await store.control<Record<string, any>>("clients")) ?? {};
  clients[hash(issued)] = {
    role: "extension",
    extensionId: String(extensionId).slice(0, 64),
    pairedAt: new Date().toISOString(),
  };
  await store.setControl("clients", clients);
  await store.db.audit(
    store.tenant,
    "owner",
    "extension.pair",
    String(extensionId).slice(0, 64),
  );
  return issued;
}

export async function revokeClients(store: Store) {
  await store.setControl("clients", {});
  await store.db.audit(
    store.tenant,
    "owner",
    "extension.revoke-all",
    "clients",
  );
}

export async function identify(
  store: Store,
  owner: string,
  header: string | undefined,
): Promise<Caller> {
  const raw = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) throw new AppError("UNAUTHORIZED", "Missing credential", 401);
  if (equal(hash(raw), hash(owner))) return { role: "owner", id: "owner" };
  const clients = (await store.control<Record<string, any>>("clients")) ?? {};
  const match = clients[hash(raw)];
  if (!match)
    throw new AppError("UNAUTHORIZED", "Unknown or revoked credential", 401);
  return { role: "extension", id: match.extensionId ?? "extension" };
}

export function requireOwner(caller: Caller) {
  if (caller.role !== "owner")
    throw new AppError("FORBIDDEN", "This action requires the local CLI", 403);
}
