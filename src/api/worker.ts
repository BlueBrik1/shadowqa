import type { Database } from "../db/database.js";
import type { Job, Project } from "../core/contracts.js";
import { Memory } from "../memory/sources.js";
import { Scheduler } from "../scheduler/jobs.js";
import { GitHub } from "../adapters/github.js";
import { SlackAdapter } from "../adapters/slack.js";
import { Publisher } from "../publisher/publisher.js";
import { sanitize } from "../core/security.js";
import { Gemini } from "../model/gemini.js";
import { repairFinding } from "../qa/repair.js";
import type { Finding } from "../qa/findings.js";
export class Worker {
  private stopping = false;
  private task?: Promise<void>;
  private lastSync = 0;
  private lastRetention = 0;
  constructor(
    private db: Database,
    private tenant: string,
    private github = new GitHub(db, tenant),
    private slack = new SlackAdapter(db, tenant),
  ) {}
  start() {
    this.task = this.loop();
  }
  async stop() {
    this.stopping = true;
    await this.task;
  }
  private async loop() {
    while (!this.stopping) {
      try {
        await this.tick();
      } catch (e) {
        console.error("Worker:", sanitize(String(e)));
      }
      if (!this.stopping) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  async tick() {
    await new Scheduler(this.db).reap(this.tenant);
    await this.inbox();
    await this.outbox();
    if (
      Date.now() - this.lastSync >
      Number(process.env.GITHUB_POLL_SECONDS ?? 180) * 1000
    ) {
      this.lastSync = Date.now();
      for (const p of (
        await this.db.list<Project>(this.tenant, "project")
      ).filter((p) => p.enabled)) {
        if (process.env.GITHUB_APP_ID)
          try {
            await this.github.reconcile(p);
          } catch (e) {
            console.error("GitHub reconciliation:", sanitize(String(e)));
          }
        const cursor = await this.db.get<any>(
            this.tenant,
            "cursor",
            `github:${p.id}`,
          ),
          scan = await this.db.get<any>(this.tenant, "schedule", p.id);
        if (
          cursor?.head &&
          (!scan ||
            Date.now() - scan.lastRun > p.profile.scanIntervalMinutes * 60_000)
        ) {
          const bucket = Math.floor(
            Date.now() / (p.profile.scanIntervalMinutes * 60_000),
          );
          await new Scheduler(this.db).scan(
            this.tenant,
            p.id,
            cursor.head,
            `scheduled:${bucket}`,
          );
          await this.db.put(
            this.tenant,
            "schedule",
            p.id,
            { lastRun: Date.now() },
            p.id,
          );
        }
        if (
          ["auto-fix", "full-auto"].includes(p.policy.mode) &&
          !(await this.db.get(this.tenant, "control", "kill"))
        ) {
          const grant = await this.db.get<any>(
            this.tenant,
            "policy-grant",
            p.id,
          );
          const identity =
            grant && grant.version === p.policy.version
              ? await this.db.one(
                  "SELECT actor_id,role,projects FROM credentials WHERE tenant=$1 AND actor_id=$2 AND revoked=false AND role='admin'",
                  [this.tenant, grant.actorId],
                )
              : undefined;
          if (identity)
            for (const finding of await this.db.list<Finding>(
              this.tenant,
              "finding",
              p.id,
            )) {
              if (
                finding.state !== "open" ||
                !["reproduced", "regression"].includes(
                  finding.classification,
                ) ||
                finding.repairAttempts >= p.policy.repairAttempts ||
                (finding.lastRepair &&
                  Date.now() - Date.parse(finding.lastRepair) <
                    p.policy.cooldownMinutes * 60_000)
              )
                continue;
              try {
                await repairFinding(
                  this.db,
                  new Gemini(this.db),
                  {
                    tenant: this.tenant,
                    id: identity.actor_id,
                    role: "admin",
                    projects: [],
                  },
                  finding.id,
                  true,
                );
              } catch (e: any) {
                if (
                  !["COOLDOWN", "EXISTING_REPAIR", "REPAIR_CAP"].includes(
                    e.code,
                  )
                )
                  console.error("Standing repair:", sanitize(e.message));
              }
            }
        }
      }
      const publisher = new Publisher(this.db, this.tenant, this.github);
      for (const job of await this.db.rows<Job>(
        "SELECT * FROM jobs WHERE tenant=$1 AND state IN ('pr_open','monitoring')",
        [this.tenant],
      ))
        try {
          await publisher.monitor(job);
        } catch (e) {
          console.error("PR monitoring:", sanitize(String(e)));
        }
    }
    if (Date.now() - this.lastRetention > 3600_000) {
      this.lastRetention = Date.now();
      await new Memory(this.db).retention(this.tenant);
    }
  }
  async inbox() {
    for (let i = 0; i < 20; i++) {
      let selected: any;
      try {
        await this.db.tx(async (db) => {
          selected = await db.one(
            "SELECT * FROM source_events WHERE tenant=$1 AND state='queued' AND available_at<=now() ORDER BY received_at LIMIT 1 FOR UPDATE SKIP LOCKED",
            [this.tenant],
          );
          if (!selected) return;
          if (selected.provider === "slack")
            await new SlackAdapter(db, this.tenant).normalize(selected.payload);
          else if (selected.provider === "github")
            await new GitHub(db, this.tenant).normalize(
              selected.payload.type,
              selected.payload.body,
            );
          await db.rows(
            "UPDATE source_events SET state='done',payload='{}' WHERE tenant=$1 AND provider=$2 AND delivery_id=$3",
            [this.tenant, selected.provider, selected.delivery_id],
          );
        });
      } catch (error) {
        if (selected)
          await this.db.failQueue(
            "source_events",
            this.tenant,
            selected.delivery_id,
            error,
          );
        else throw error;
      }
      if (!selected) break;
    }
  }
  async outbox() {
    let failure: { key: string; error: unknown } | undefined;
    await this.db.tx(async (db) => {
      const item = await db.one(
        "SELECT * FROM outbox WHERE tenant=$1 AND state='queued' AND available_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        [this.tenant],
      );
      if (!item) return;
      try {
        if (item.kind === "publish")
          await new Publisher(this.db, this.tenant, this.github).publish(
            item.data.jobId,
          );
        else if (item.kind === "slack-report") {
          if (process.env.SLACK_BOT_TOKEN)
            await this.slack.report(
              await this.db.project(this.tenant, item.project_id),
              item.data.jobId,
              item.data.text,
            );
        } else throw new Error("Unknown outbox action");
        await db.rows(
          "UPDATE outbox SET state='done' WHERE tenant=$1 AND id=$2",
          [this.tenant, item.id],
        );
      } catch (error) {
        failure = { key: item.id, error };
      }
    });
    if (failure)
      await this.db.failQueue(
        "outbox",
        this.tenant,
        failure.key,
        failure.error,
      );
  }
}
