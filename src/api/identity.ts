import type { Database } from "../db/database.js";
import type { Principal } from "../core/contracts.js";
import { AppError, authorize, hash, token } from "../core/security.js";
import { createPublicKey, verify } from "node:crypto";
/** OAuth state is one-use, bound to an already authenticated local membership. No display-name matching. */
export class IdentityLinks {
  constructor(private db: Database) {}
  async begin(actor: Principal, provider: "github" | "slack") {
    authorize(actor);
    const client =
      process.env[
        provider === "github" ? "GITHUB_CLIENT_ID" : "SLACK_CLIENT_ID"
      ];
    if (!client)
      throw new AppError(
        "OAUTH_SETUP",
        `Configure ${provider} OAuth client credentials`,
      );
    const state = token(),
      base = process.env.SHADOWQA_PUBLIC_URL ?? "http://127.0.0.1:4380";
    const nonce = token();
    await this.db.put(actor.tenant, "oauth", hash(state), {
      actorId: actor.id,
      tenant: actor.tenant,
      provider,
      nonce,
      expiresAt: Date.now() + 600_000,
    });
    const url = new URL(
      provider === "github"
        ? "https://github.com/login/oauth/authorize"
        : "https://slack.com/openid/connect/authorize",
    );
    url.searchParams.set("client_id", client);
    url.searchParams.set("state", actor.tenant + "." + state);
    url.searchParams.set("redirect_uri", `${base}/oauth/${provider}/callback`);
    if (provider === "slack") {
      url.searchParams.set("scope", "openid profile");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("team", process.env.SLACK_TEAM_ID ?? "");
    }
    return { url: url.toString() };
  }
  async finish(
    provider: "github" | "slack",
    input: { code: string; state: string },
  ) {
    const [tenant, raw, ...extra] = input.state.split(".");
    if (!tenant || !raw || extra.length)
      throw new AppError("OAUTH_STATE", "Invalid OAuth state");
    const state = await this.db.tx(async (db) => {
      const row = await db.one(
        "DELETE FROM entities WHERE tenant=$1 AND kind='oauth' AND id=$2 RETURNING data",
        [tenant, hash(raw)],
      );
      if (
        !row ||
        row.data.provider !== provider ||
        row.data.expiresAt < Date.now()
      )
        throw new AppError(
          "OAUTH_STATE",
          "OAuth state expired or already used",
        );
      return row.data;
    });
    const clientId =
        process.env[
          provider === "github" ? "GITHUB_CLIENT_ID" : "SLACK_CLIENT_ID"
        ] ?? "",
      clientSecret =
        process.env[
          provider === "github" ? "GITHUB_CLIENT_SECRET" : "SLACK_CLIENT_SECRET"
        ] ?? "";
    const redirect =
      (process.env.SHADOWQA_PUBLIC_URL ?? "http://127.0.0.1:4380") +
      `/oauth/${provider}/callback`;
    const response = await fetch(
      provider === "github"
        ? "https://github.com/login/oauth/access_token"
        : "https://slack.com/api/openid.connect.token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: input.code,
          redirect_uri: redirect,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const result: any = await response.json();
    let id: string;
    if (provider === "github") {
      if (!result.access_token)
        throw new AppError("OAUTH_FAILED", "GitHub authorization failed");
      const r = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${result.access_token}`,
          "User-Agent": "ShadowQA",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok)
        throw new AppError("OAUTH_FAILED", "GitHub identity lookup failed");
      const user: any = await r.json();
      id = String(user.id);
    } else {
      if (!result.ok || !result.id_token)
        throw new AppError("OAUTH_FAILED", "Slack authorization failed");
      const [header, payload, signature] = String(result.id_token).split(".");
      const h = JSON.parse(Buffer.from(header, "base64url").toString()),
        claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      const keys: any = await (
        await fetch("https://slack.com/openid/connect/keys", {
          signal: AbortSignal.timeout(15_000),
        })
      ).json();
      const jwk = keys.keys?.find(
        (k: any) => k.kid === h.kid && k.kty === "RSA",
      );
      if (
        h.alg !== "RS256" ||
        !jwk ||
        !verify(
          "RSA-SHA256",
          Buffer.from(header + "." + payload),
          createPublicKey({ key: jwk, format: "jwk" }),
          Buffer.from(signature, "base64url"),
        ) ||
        claims.iss !== "https://slack.com" ||
        claims.aud !== clientId ||
        claims.exp <= Date.now() / 1000 ||
        claims.nonce !== state.nonce ||
        claims["https://slack.com/team_id"] !== process.env.SLACK_TEAM_ID
      )
        throw new AppError(
          "OAUTH_FAILED",
          "Slack identity verification failed",
        );
      id = String(claims.sub);
    }
    await this.db.tx(async (db) => {
      const member = await db.one(
        "SELECT actor_id FROM credentials WHERE tenant=$1 AND actor_id=$2 AND revoked=false FOR UPDATE",
        [tenant, state.actorId],
      );
      if (!member) throw new AppError("REVOKED", "Membership was revoked");
      const existing = await db.get<any>(
        tenant,
        "identity",
        `${provider}:${id}`,
      );
      if (existing && existing.actorId !== state.actorId)
        throw new AppError(
          "IDENTITY_BOUND",
          "Provider identity is already linked",
        );
      await db.rows(
        "INSERT INTO entities(tenant,kind,id,data) VALUES($1,'identity',$2,$3) ON CONFLICT DO NOTHING",
        [
          tenant,
          `${provider}:${id}`,
          JSON.stringify({
            provider,
            id,
            actorId: state.actorId,
            linkedAt: new Date().toISOString(),
          }),
        ],
      );
      const linked = await db.get<any>(tenant, "identity", `${provider}:${id}`);
      if (linked.actorId !== state.actorId)
        throw new AppError(
          "IDENTITY_BOUND",
          "Provider identity is already linked",
        );
      await db.audit(
        tenant,
        state.actorId,
        "identity.link",
        `${provider}:${id}`,
      );
    });
  }
}
