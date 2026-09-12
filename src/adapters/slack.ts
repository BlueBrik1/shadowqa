import bolt from "@slack/bolt";
import type { App as BoltApp, Receiver } from "@slack/bolt";
import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import type { Database } from "../db/database.js";
import type { Project } from "../core/contracts.js";
import { Memory } from "../memory/sources.js";
import { hash, sanitize } from "../core/security.js";

/** Bolt receiver persists each envelope before acknowledging Slack. */
class DurableReceiver implements Receiver {
  private app?: BoltApp;
  readonly socket: SocketModeClient;
  // These are used to build each envelope's adapter and memory; the receiver keeps no state of
  // its own, so they stay plain parameters rather than fields.
  constructor(db: Database, tenant: string, appToken: string) {
    this.socket = new SocketModeClient({ appToken, logLevel: "error" as any });
    this.socket.on("slack_event", async ({ body, ack }: any) => {
      try {
        const adapter = new SlackAdapter(db, tenant);
        if (await adapter.accepts(body))
          await new Memory(db).ingest(
            tenant,
            "slack",
            body.event_id ?? hash(body),
            body,
          );
        await ack();
        await this.app?.processEvent({ body, ack: async () => {} });
      } catch (e) {
        console.error("Slack intake:", sanitize(String(e)));
      }
    });
  }
  init(app: BoltApp) {
    this.app = app;
  }
  async start() {
    return this.socket.start();
  }
  async stop() {
    await this.socket.disconnect();
  }
}
export class SlackAdapter {
  readonly web: WebClient;
  private app?: BoltApp;
  constructor(
    private db: Database,
    private tenant: string,
    private botToken = process.env.SLACK_BOT_TOKEN ?? "",
    private team = process.env.SLACK_TEAM_ID ?? "",
  ) {
    this.web = new WebClient(botToken, { retryConfig: { retries: 2 } });
  }
  async start() {
    if (!this.botToken || !process.env.SLACK_APP_TOKEN) return;
    const auth = await this.web.auth.test();
    if (!this.team || auth.team_id !== this.team)
      throw new Error("SLACK_TEAM_ID must match the installed bot workspace");
    this.app = new bolt.App({
      token: this.botToken,
      receiver: new DurableReceiver(
        this.db,
        this.tenant,
        process.env.SLACK_APP_TOKEN,
      ),
      ignoreSelf: false,
    });
    this.app.event("message", async () => {});
    this.app.event("app_mention", async () => {});
    this.app.error(async (e) =>
      console.error("Slack Bolt:", sanitize(e.message)),
    );
    await this.app.start();
    await this.db.put(this.tenant, "connection", "slack", {
      provider: "slack",
      state: "connected",
      lastSuccess: new Date().toISOString(),
    });
  }
  async stop() {
    await this.app?.stop();
  }
  async accepts(body: any) {
    if (
      !this.team ||
      body.team_id !== this.team ||
      !body.event?.channel ||
      ["im", "mpim"].includes(body.event.channel_type)
    )
      return false;
    return (await this.db.list<Project>(this.tenant, "project")).some(
      (p) => p.enabled && p.channels.some((c) => c.id === body.event.channel),
    );
  }
  async normalize(body: any) {
    if (!this.team || body.team_id !== this.team) return;
    const e = body.event;
    if (!e) return;
    const projects = await this.db.list<Project>(this.tenant, "project");
    const project = projects.find(
      (p) => p.enabled && p.channels.some((c) => c.id === e.channel),
    );
    if (!project) return;
    if (e.type === "channel_left" || e.type === "channel_archive") {
      await new Memory(this.db).revoke(
        this.tenant,
        project.id,
        "slack",
        e.channel,
      );
      return;
    }
    if (
      !["message", "app_mention"].includes(e.type) ||
      ["im", "mpim"].includes(e.channel_type)
    )
      return;
    const deleted = e.subtype === "message_deleted";
    const message = e.subtype === "message_changed" ? e.message : e;
    const ts = deleted ? e.deleted_ts : message?.ts;
    if (!ts) return;
    const eventTs = e.event_ts ?? body.event_time ?? ts;
    const sourceSeconds = Number(message?.edited?.ts ?? eventTs);
    if (!Number.isFinite(sourceSeconds)) return;
    const key = `${this.team}:${e.channel}:${ts}`;
    await new Memory(this.db).upsert({
      tenant: this.tenant,
      project_id: project.id,
      provider: "slack",
      source_key: key,
      revision: String(message?.edited?.ts ?? eventTs),
      source_time: new Date(sourceSeconds * 1000).toISOString(),
      text: deleted ? "" : String(message?.text ?? ""),
      url: `https://app.slack.com/archives/${e.channel}/p${String(ts).replace(".", "")}`,
      visibility: project.channels.find((c) => c.id === e.channel)?.private
        ? "private"
        : "team",
      deleted,
      metadata: {
        channel: e.channel,
        threadTs: message?.thread_ts ?? ts,
        ts,
        author: message?.user ?? message?.bot_id,
        team: this.team,
        origin: message?.metadata?.event_type ?? "slack",
      },
    });
  }
  async backfill(
    project: Project,
    oldest = String(Math.floor(Date.now() / 1000) - 7 * 86400),
  ) {
    for (const channel of project.channels) {
      let cursor: string | undefined;
      let pages = 0;
      try {
        do {
          const response = await this.web.conversations.history({
            channel: channel.id,
            oldest,
            cursor,
            limit: 100,
          });
          for (const message of response.messages ?? []) {
            await this.normalize({
              team_id: this.team,
              event: {
                ...message,
                type: "message",
                channel: channel.id,
                event_ts: message.edited?.ts ?? message.ts,
              },
            });
            if ((message.reply_count ?? 0) > 0 && message.ts)
              await this.thread(project, channel.id, message.ts);
          }
          cursor = response.response_metadata?.next_cursor;
        } while (cursor && ++pages < 20);
        await this.db.put(
          this.tenant,
          "cursor",
          `slack:${channel.id}`,
          {
            provider: "slack",
            projectId: project.id,
            channel: channel.id,
            oldest,
            lastSuccess: new Date().toISOString(),
            gap: !!cursor,
            cursor,
          },
          project.id,
        );
      } catch (e: any) {
        await this.db.put(
          this.tenant,
          "cursor",
          `slack:${channel.id}`,
          {
            provider: "slack",
            projectId: project.id,
            channel: channel.id,
            gap: true,
            error: sanitize(e.message),
          },
          project.id,
        );
        throw e;
      }
    }
  }
  async thread(project: Project, channel: string, ts: string) {
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await this.web.conversations.replies({
        channel,
        ts,
        cursor,
        limit: 100,
      });
      for (const m of r.messages ?? [])
        await this.normalize({
          team_id: this.team,
          event: {
            ...m,
            type: "message",
            channel,
            event_ts: m.edited?.ts ?? m.ts,
          },
        });
      cursor = r.response_metadata?.next_cursor;
    } while (cursor && ++pages < 20);
    if (cursor)
      await this.db.put(
        this.tenant,
        "cursor",
        `thread:${channel}:${ts}`,
        { gap: true, cursor, projectId: project.id },
        project.id,
      );
  }
  async report(project: Project, jobId: string, text: string) {
    // Only preconfigured channels receive the already-safe status string; no private excerpts.
    for (const channel of project.channels) {
      const key = `slack-report:${jobId}:${channel.id}`;
      if (await this.db.get(this.tenant, "delivery", key)) continue;
      const response = await this.web.chat.postMessage({
        channel: channel.id,
        text: sanitize(text),
        unfurl_links: false,
        unfurl_media: false,
        metadata: { event_type: "shadowqa_status", event_payload: { jobId } },
        client_msg_id: hash(key).slice(0, 32),
      } as any);
      await this.db.put(
        this.tenant,
        "delivery",
        key,
        { ts: response.ts, channel: channel.id },
        project.id,
      );
    }
  }
}
