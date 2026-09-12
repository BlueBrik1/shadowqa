import { z } from "zod";

/** Where a captured message came from. Only surfaces ShadowQA can actually read are listed. */
export const Origin = z.enum(["chatgpt", "claude", "claude-code", "codex"]);
export type Origin = z.infer<typeof Origin>;

/** Execution backends a user may choose for a plan. */
export const Backend = z.enum(["opencode", "claude-code", "codex"]);
export type Backend = z.infer<typeof Backend>;

export const Mode = z.enum(["observe", "approval", "auto-fix", "full-auto"]);
export type Mode = z.infer<typeof Mode>;

export const Id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,200}$/);
export const Sha = z.string().regex(/^[a-f0-9]{40,64}$/);

/**
 * A single captured turn. `order` is the adapter's observed position inside the conversation;
 * `externalId` is the site's own identifier when one exists, which is what makes an edited
 * message update in place instead of duplicating.
 */
export const CapturedMessage = z.object({
  origin: Origin,
  conversationId: z.string().min(1).max(300),
  externalId: z.string().max(300).optional(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  text: z.string().max(200_000),
  order: z.number().int().min(0),
  url: z.string().max(2000),
  /** Only present when the surface actually exposes one; never invented from capture time. */
  timestamp: z.string().datetime().optional(),
  capturedAt: z.string().datetime(),
  /** False when the adapter saw a streaming response that had not settled. */
  complete: z.boolean().default(true),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type CapturedMessage = z.infer<typeof CapturedMessage>;

export const CaptureBatch = z.object({
  projectId: Id,
  conversation: z.object({
    origin: Origin,
    conversationId: z.string().min(1).max(300),
    title: z.string().max(500).default(""),
    url: z.string().max(2000),
    /**
     * `partial` records that the adapter only ever saw the messages present in the DOM while
     * the tab was open. ShadowQA never presents a partial capture as a full history.
     */
    coverage: z.enum(["partial", "session"]).default("partial"),
  }),
  messages: z.array(CapturedMessage).max(500),
});
export type CaptureBatch = z.infer<typeof CaptureBatch>;

export const Conversation = z.object({
  id: Id,
  projectId: Id,
  origin: Origin,
  conversationId: z.string(),
  title: z.string(),
  url: z.string(),
  coverage: z.enum(["partial", "session"]),
  tracked: z.boolean().default(true),
  paused: z.boolean().default(false),
  messageCount: z.number().int().default(0),
  firstSeen: z.string(),
  lastSync: z.string(),
  lastError: z.string().optional(),
});
export type Conversation = z.infer<typeof Conversation>;

/** Repository the project plans and executes against. No GitHub account is required. */
export const Repo = z.object({
  path: z.string().min(1),
  defaultBranch: z.string().default("main"),
  /** Populated only when the user connects GitHub; PR creation is otherwise unavailable. */
  remote: z.string().optional(),
});

export const Checks = z
  .array(
    z.object({
      id: Id,
      argv: z.array(z.string().max(400)).min(1).max(20),
      timeoutSeconds: z.number().int().min(1).max(1800).default(600),
    }),
  )
  .default([]);

export const IndividualProject = z.object({
  id: Id,
  name: z.string().min(1),
  repo: Repo.optional(),
  backend: Backend.default("opencode"),
  mode: Mode.default("approval"),
  policyVersion: z.number().int().default(1),
  checks: Checks,
  requiredChecks: z.array(Id).default([]),
  allowedPaths: z.array(z.string()).default(["src/", "tests/", "docs/"]),
  protectedPaths: z
    .array(z.string())
    .default([".github/", ".env", "package-lock.json"]),
  autoPaths: z.array(z.string()).default(["docs/"]),
  maxFiles: z.number().int().min(1).max(100).default(12),
  maxLines: z.number().int().min(1).max(5000).default(400),
  repairAttempts: z.number().int().min(1).max(2).default(2),
  createdAt: z.string(),
});
export type IndividualProject = z.infer<typeof IndividualProject>;

/**
 * An extracted item always carries the message ids it came from. A model suggestion is
 * `proposed` until a human confirms it; nothing is silently promoted to a requirement.
 */
export const ItemKind = z.enum([
  "requirement",
  "constraint",
  "decision",
  "suggestion",
  "question",
  "conflict",
]);
export type ItemKind = z.infer<typeof ItemKind>;

export const ExtractedItem = z.object({
  id: Id,
  projectId: Id,
  kind: ItemKind,
  text: z.string().min(1).max(4000),
  status: z
    .enum(["proposed", "confirmed", "rejected", "answered"])
    .default("proposed"),
  /** Message ids (tenant-local) that support this item. Empty is rejected at extraction time. */
  sources: z.array(z.string()).min(1).max(50),
  conflictsWith: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  editedByUser: z.boolean().default(false),
});
export type ExtractedItem = z.infer<typeof ExtractedItem>;

/** Structured output contract for the extraction call. */
export const ExtractionOutput = z.object({
  items: z
    .array(
      z.object({
        kind: ItemKind,
        text: z.string().min(3).max(4000),
        /** Indices into the numbered excerpt list given to the model. */
        sourceIndexes: z.array(z.number().int().min(0)).min(1).max(20),
        conflictsWithIndexes: z
          .array(z.number().int().min(0))
          .max(20)
          .default([]),
      }),
    )
    .max(60),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;

export const PlanOutput = z.object({
  objective: z.string().min(5).max(2000),
  scope: z.string().min(3).max(2000),
  exclusions: z.array(z.string()).max(20).default([]),
  affectedPaths: z.array(z.string().min(1).max(300)).min(1).max(60),
  steps: z
    .array(
      z.object({
        id: Id,
        description: z.string().max(2000),
        dependsOn: z.array(Id).default([]),
      }),
    )
    .min(1)
    .max(30),
  acceptanceCriteria: z.array(z.string()).min(1).max(30),
  tests: z.array(z.string()).max(30).default([]),
  unresolvedQuestions: z.array(z.string()).max(30).default([]),
  risks: z.array(z.string()).max(30).default([]),
  rollback: z.string().min(1).max(2000),
  citedItemIds: z.array(z.string()).max(100).default([]),
  inspectedPaths: z.array(z.string()).min(1).max(100),
});
export type PlanOutput = z.infer<typeof PlanOutput>;

export const Plan = PlanOutput.extend({
  id: Id,
  projectId: Id,
  version: z.number().int(),
  baseSha: Sha,
  backend: Backend,
  digest: z.string(),
  policyVersion: z.number().int(),
  model: z.string(),
  status: z.enum([
    "awaiting_approval",
    "approved",
    "rejected",
    "superseded",
    "executed",
  ]),
  createdAt: z.string(),
  expiresAt: z.string(),
  contextDigest: z.string(),
  sources: z.array(
    z.object({
      id: z.string(),
      origin: Origin,
      url: z.string(),
      confirmed: z.boolean(),
    }),
  ),
});
export type Plan = z.infer<typeof Plan>;

export const TaskStates = [
  "queued",
  "waiting_for_runner",
  "preparing",
  "running",
  "verifying",
  "ready",
  "needs_review",
  "done",
  "cancelled",
  "failed",
] as const;
export type TaskState = (typeof TaskStates)[number];

export type Task = {
  id: string;
  projectId: string;
  planId: string | null;
  kind: "plan" | "repair" | "scan";
  state: TaskState;
  backend: Backend;
  attempts: number;
  workspace?: string;
  sessionRef?: string;
  diff?: string;
  checks?: {
    id: string;
    exitCode: number;
    output: string;
    durationMs: number;
    timedOut: boolean;
  }[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type IndividualPrincipal = {
  tenant: string;
  id: string;
  role: "owner" | "extension" | "companion";
};
