import { randomUUID } from "node:crypto";
import { Database } from "../../src/db/database.js";
import { Memory } from "../../src/memory/sources.js";
import { AppError, hash, sanitize } from "../../src/core/security.js";
import {
  CaptureBatch,
  Conversation,
  ExtractedItem,
  IndividualProject,
  type Origin,
  type Plan,
  type Task,
} from "./contracts.js";
import { collapse, isContinuation, revisionOf } from "./dedupe.js";

/**
 * Individual data lives in its own tenant. The schema, revision handling and full-text index are
 * the business version's; only the tenant and the entity kinds differ, so the two products can
 * share one database without sharing a single row.
 */
export const KIND = {
  project: "iproject",
  conversation: "iconversation",
  item: "iitem",
  plan: "iplan",
  task: "itask",
  finding: "ifinding",
  pairing: "ipairing",
  control: "icontrol",
  session: "isession",
} as const;

export const tenantId = () =>
  process.env.SHADOWQA_INDIVIDUAL_TENANT ?? "individual";

export type StoredMessage = {
  id: string;
  project_id: string;
  provider: string;
  source_key: string;
  revision: string;
  source_time: string;
  text: string;
  url: string;
  confirmed: boolean;
  deleted: boolean;
  metadata: Record<string, any>;
};

export class Store {
  readonly memory: Memory;
  constructor(
    readonly db: Database,
    readonly tenant = tenantId(),
  ) {
    this.memory = new Memory(db);
  }

  // ---- projects -------------------------------------------------------------

  async putProject(project: IndividualProject) {
    const parsed = IndividualProject.parse(project);
    await this.db.put(this.tenant, KIND.project, parsed.id, parsed, parsed.id);
    return parsed;
  }

  async project(id: string): Promise<IndividualProject> {
    const found = await this.db.get<IndividualProject>(
      this.tenant,
      KIND.project,
      id,
    );
    if (!found)
      throw new AppError("NO_PROJECT", `No project '${sanitize(id)}'`, 404);
    return found;
  }

  projects() {
    return this.db.list<IndividualProject>(this.tenant, KIND.project);
  }

  /** A mode or backend change bumps the policy version, which invalidates existing approvals. */
  async updateProject(id: string, patch: Partial<IndividualProject>) {
    const current = await this.project(id);
    const bump =
      (patch.mode && patch.mode !== current.mode) ||
      (patch.backend && patch.backend !== current.backend) ||
      (patch.checks && hash(patch.checks) !== hash(current.checks));
    const next = IndividualProject.parse({
      ...current,
      ...patch,
      policyVersion: current.policyVersion + (bump ? 1 : 0),
    });
    await this.db.put(this.tenant, KIND.project, id, next, id);
    if (bump) await this.invalidatePlans(id);
    return next;
  }

  private async invalidatePlans(projectId: string) {
    for (const plan of await this.plans(projectId))
      if (plan.status === "awaiting_approval" || plan.status === "approved")
        await this.db.put(
          this.tenant,
          KIND.plan,
          plan.id,
          { ...plan, status: "superseded" },
          projectId,
        );
  }

  // ---- conversations and messages -------------------------------------------

  conversationKey = (origin: Origin, conversationId: string) =>
    `${origin}:${conversationId}`;

  async conversation(origin: Origin, conversationId: string) {
    return this.db.get<Conversation>(
      this.tenant,
      KIND.conversation,
      this.conversationKey(origin, conversationId),
    );
  }

  conversations(projectId?: string) {
    return this.db.list<Conversation>(
      this.tenant,
      KIND.conversation,
      projectId,
    );
  }

  /**
   * Stores a capture batch. Returns per-message outcomes so the side panel can show what
   * actually happened rather than a generic success.
   */
  async capture(batch: CaptureBatch) {
    const parsed = CaptureBatch.parse(batch);
    await this.project(parsed.projectId);
    const id = this.conversationKey(
      parsed.conversation.origin,
      parsed.conversation.conversationId,
    );
    const now = new Date().toISOString();
    const existing = await this.db.get<Conversation>(
      this.tenant,
      KIND.conversation,
      id,
    );
    if (existing?.paused)
      return {
        conversationId: id,
        paused: true,
        stored: 0,
        updated: 0,
        skipped: parsed.messages.length,
      };

    let stored = 0;
    let updated = 0;
    let skipped = 0;
    for (const { key, message } of collapse(parsed.messages)) {
      const previous = await this.db.one<StoredMessage>(
        "SELECT * FROM source_documents WHERE tenant=$1 AND provider=$2 AND source_key=$3",
        [this.tenant, message.origin, key],
      );
      if (previous) {
        const same = previous.text === sanitize(message.text).slice(0, 100_000);
        const growing = isContinuation(previous.text, message.text);
        if (same || (!growing && !message.complete)) {
          skipped++;
          continue;
        }
      }
      await this.memory.upsert({
        tenant: this.tenant,
        project_id: parsed.projectId,
        provider: message.origin,
        source_key: key,
        revision: revisionOf(message),
        // Captured-at is used when the surface exposes no timestamp; it is recorded as such.
        source_time: message.timestamp ?? message.capturedAt,
        text: message.text,
        url: message.url,
        visibility: "private",
        deleted: false,
        metadata: {
          role: message.role,
          order: message.order,
          origin: message.origin,
          conversationId: message.conversationId,
          externalId: message.externalId ?? null,
          complete: message.complete,
          timestampObserved: !!message.timestamp,
          ...message.meta,
        },
      });
      if (previous) updated++;
      else stored++;
    }

    const count = await this.messageCount(
      parsed.projectId,
      parsed.conversation.origin,
      parsed.conversation.conversationId,
    );
    const conversation: Conversation = Conversation.parse({
      ...(existing ?? {}),
      id,
      projectId: parsed.projectId,
      origin: parsed.conversation.origin,
      conversationId: parsed.conversation.conversationId,
      title:
        parsed.conversation.title ||
        existing?.title ||
        parsed.conversation.conversationId,
      url: parsed.conversation.url,
      coverage: parsed.conversation.coverage,
      tracked: existing?.tracked ?? true,
      paused: false,
      messageCount: count,
      firstSeen: existing?.firstSeen ?? now,
      lastSync: now,
      lastError: undefined,
    });
    await this.db.put(
      this.tenant,
      KIND.conversation,
      id,
      conversation,
      parsed.projectId,
    );
    return {
      conversationId: id,
      paused: false,
      stored,
      updated,
      skipped,
      messageCount: count,
    };
  }

  async messageCount(
    projectId: string,
    origin: Origin,
    conversationId: string,
  ) {
    const row = await this.db.one<{ count: string }>(
      `SELECT count(*)::text AS count FROM source_documents
       WHERE tenant=$1 AND project_id=$2 AND provider=$3 AND deleted=false AND metadata->>'conversationId'=$4`,
      [this.tenant, projectId, origin, conversationId],
    );
    return Number(row?.count ?? 0);
  }

  async setConversationError(id: string, error: string) {
    const existing = await this.db.get<Conversation>(
      this.tenant,
      KIND.conversation,
      id,
    );
    if (!existing) return;
    await this.db.put(
      this.tenant,
      KIND.conversation,
      id,
      { ...existing, lastError: sanitize(error).slice(0, 500) },
      existing.projectId,
    );
  }

  async pauseConversation(id: string, paused: boolean) {
    const existing = await this.db.get<Conversation>(
      this.tenant,
      KIND.conversation,
      id,
    );
    if (!existing)
      throw new AppError("NO_CONVERSATION", "Unknown conversation", 404);
    const next = {
      ...existing,
      paused,
      tracked: paused ? existing.tracked : true,
    };
    await this.db.put(
      this.tenant,
      KIND.conversation,
      id,
      next,
      existing.projectId,
    );
    return next;
  }

  /** Removes a conversation from tracking but keeps what was already captured. */
  async untrackConversation(id: string) {
    const existing = await this.db.get<Conversation>(
      this.tenant,
      KIND.conversation,
      id,
    );
    if (!existing)
      throw new AppError("NO_CONVERSATION", "Unknown conversation", 404);
    const next = { ...existing, tracked: false, paused: true };
    await this.db.put(
      this.tenant,
      KIND.conversation,
      id,
      next,
      existing.projectId,
    );
    return next;
  }

  /** Deletes the stored text of a conversation and invalidates anything derived from it. */
  async forgetConversation(id: string) {
    const existing = await this.db.get<Conversation>(
      this.tenant,
      KIND.conversation,
      id,
    );
    if (!existing)
      throw new AppError("NO_CONVERSATION", "Unknown conversation", 404);
    const removed = await this.db.rows(
      `UPDATE source_documents SET text='',deleted=true,confirmed=false,metadata='{}'
       WHERE tenant=$1 AND project_id=$2 AND provider=$3 AND metadata->>'conversationId'=$4 RETURNING id`,
      [
        this.tenant,
        existing.projectId,
        existing.origin,
        existing.conversationId,
      ],
    );
    const ids = new Set(removed.map((r: any) => r.id));
    for (const item of await this.items(existing.projectId))
      if (item.sources.some((s) => ids.has(s)))
        await this.db.rows(
          "DELETE FROM entities WHERE tenant=$1 AND kind=$2 AND id=$3",
          [this.tenant, KIND.item, item.id],
        );
    await this.db.rows(
      "DELETE FROM entities WHERE tenant=$1 AND kind=$2 AND id=$3",
      [this.tenant, KIND.conversation, id],
    );
    await this.db.audit(this.tenant, "owner", "conversation.forget", id, {
      messages: removed.length,
    });
    return { removedMessages: removed.length };
  }

  /** Project-scoped retrieval. Confirmed sources rank first, exactly as the business planner does. */
  async context(
    projectId: string,
    query = "",
    limit = 80,
  ): Promise<StoredMessage[]> {
    return this.db.rows(
      `SELECT * FROM source_documents WHERE tenant=$1 AND project_id=$2 AND deleted=false
       ${query ? "AND (search @@ websearch_to_tsquery('english',$4) OR url=$4)" : ""}
       ORDER BY confirmed DESC, source_time DESC LIMIT $3`,
      query
        ? [this.tenant, projectId, limit, query]
        : [this.tenant, projectId, limit],
    );
  }

  async message(id: string): Promise<StoredMessage | undefined> {
    return this.db.one(
      "SELECT * FROM source_documents WHERE tenant=$1 AND id=$2",
      [this.tenant, id],
    );
  }

  // ---- extracted items ------------------------------------------------------

  async putItem(item: ExtractedItem) {
    const parsed = ExtractedItem.parse(item);
    await this.db.put(
      this.tenant,
      KIND.item,
      parsed.id,
      parsed,
      parsed.projectId,
    );
    return parsed;
  }

  items(projectId: string) {
    return this.db.list<ExtractedItem>(this.tenant, KIND.item, projectId);
  }

  async item(id: string) {
    const found = await this.db.get<ExtractedItem>(this.tenant, KIND.item, id);
    if (!found) throw new AppError("NO_ITEM", "Unknown item", 404);
    return found;
  }

  /** Users correct extraction directly; a corrected item is marked so the model cannot undo it. */
  async reviseItem(
    id: string,
    patch: Partial<Pick<ExtractedItem, "text" | "kind" | "status">>,
  ) {
    const current = await this.item(id);
    const next = ExtractedItem.parse({
      ...current,
      ...patch,
      editedByUser: true,
      updatedAt: new Date().toISOString(),
    });
    await this.db.put(this.tenant, KIND.item, id, next, current.projectId);
    await this.db.audit(this.tenant, "owner", "item.revise", id, patch);
    return next;
  }

  // ---- plans and tasks ------------------------------------------------------

  async putPlan(plan: Plan) {
    await this.db.put(this.tenant, KIND.plan, plan.id, plan, plan.projectId);
    return plan;
  }

  plans(projectId?: string) {
    return this.db.list<Plan>(this.tenant, KIND.plan, projectId);
  }

  async plan(id: string) {
    const found = await this.db.get<Plan>(this.tenant, KIND.plan, id);
    if (!found) throw new AppError("NO_PLAN", "Unknown plan", 404);
    return found;
  }

  async putTask(task: Task) {
    await this.db.put(this.tenant, KIND.task, task.id, task, task.projectId);
    return task;
  }

  tasks(projectId?: string) {
    return this.db.list<Task>(this.tenant, KIND.task, projectId);
  }

  async task(id: string) {
    const found = await this.db.get<Task>(this.tenant, KIND.task, id);
    if (!found) throw new AppError("NO_TASK", "Unknown task", 404);
    return found;
  }

  async patchTask(id: string, patch: Partial<Task>) {
    const current = await this.task(id);
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.db.put(this.tenant, KIND.task, id, next, current.projectId);
    return next;
  }

  // ---- control --------------------------------------------------------------

  async control<T = any>(key: string): Promise<T | undefined> {
    return this.db.get<T>(this.tenant, KIND.control, key);
  }

  async setControl(key: string, value: unknown) {
    await this.db.put(this.tenant, KIND.control, key, value);
  }

  id = () => randomUUID();
}
