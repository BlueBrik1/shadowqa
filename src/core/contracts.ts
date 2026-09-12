import { z } from "zod";

export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const Sha = z.string().regex(/^[a-f0-9]{40,64}$/);
export const Mode = z.enum(["observe", "approval", "auto-fix", "full-auto"]);
export const Command = z.object({
  id: Id,
  argv: z.array(z.string().max(1000)).min(1).max(30),
  timeoutSeconds: z.number().int().min(1).max(1200).default(120),
});
export const Profile = z.object({
  id: Id,
  image: z
    .string()
    .regex(/^[a-zA-Z0-9./:_@-]+$/)
    .default("shadowqa-sandbox:1.15.10"),
  checks: z.array(Command).min(1),
  install: z.array(Command).default([]),
  allowedPaths: z.array(z.string()).min(1),
  protectedPaths: z.array(z.string()).default([]),
  autoPaths: z.array(z.string()).default(["docs/"]),
  maxFiles: z.number().int().min(1).max(100).default(12),
  maxLines: z.number().int().min(1).max(5000).default(400),
  timeoutSeconds: z.number().int().min(10).max(3600).default(1200),
  memoryMb: z.number().int().min(256).max(8192).default(2048),
  cpus: z.number().min(0.25).max(8).default(2),
  reviewed: z.boolean().default(false),
  externalInferenceApproved: z.boolean().default(false),
  requiredChecks: z.array(Id).min(1),
  scanIntervalMinutes: z.number().int().min(5).default(1440),
});
export const Policy = z.object({
  mode: Mode.default("approval"),
  version: z.number().int().positive().default(1),
  dailyJobCap: z.number().int().min(1).max(100).default(10),
  repairAttempts: z.number().int().min(1).max(2).default(2),
  cooldownMinutes: z.number().int().min(1).default(60),
  autoMerge: z.boolean().default(false),
  requiredGithubChecks: z.array(z.string()).default([]),
  publishSummary: z
    .string()
    .max(1000)
    .default("Automated maintenance verified by ShadowQA."),
  summaryApproved: z.boolean().default(false),
});
export const Project = z.object({
  id: Id,
  name: z.string().min(1),
  audience: z.enum(["team", "public"]).default("team"),
  repository: z.object({
    id: Id,
    githubId: z.number().int().positive(),
    owner: z.string().regex(/^[\w.-]+$/),
    name: z.string().regex(/^[\w.-]+$/),
    installationId: z.number().int().positive(),
    defaultBranch: z.string().regex(/^[\w./-]+$/),
    visibility: z.enum(["private", "public"]),
    localPath: z.string().min(1),
  }),
  channels: z
    .array(
      z.object({
        id: z.string().regex(/^[CG][A-Z0-9]+$/),
        private: z.boolean().default(false),
      }),
    )
    .default([]),
  profile: Profile,
  policy: Policy,
  enabled: z.boolean().default(true),
});
export type Project = z.infer<typeof Project>;
export type Profile = z.infer<typeof Profile>;
export type Policy = z.infer<typeof Policy>;
export type Command = z.infer<typeof Command>;
export type Principal = {
  tenant: string;
  id: string;
  role: "admin" | "developer" | "viewer" | "runner";
  projects: string[];
};
export const SourceRef = z.object({
  id: z.string(),
  revision: z.string(),
  url: z.string(),
  confirmed: z.boolean(),
});
export const PlanOutput = z.object({
  objective: z.string().min(5).max(2000),
  exclusions: z.array(z.string()).max(20),
  expectedPaths: z.array(z.string().min(1).max(300)).min(1).max(100),
  steps: z
    .array(
      z.object({
        id: Id,
        description: z.string().max(2000),
        dependsOn: z.array(Id),
      }),
    )
    .min(1)
    .max(30),
  acceptanceCriteria: z.array(z.string()).min(1).max(30),
  regressionStrategy: z.string().min(1).max(2000),
  riskFlags: z.array(z.string()).max(30),
  rollback: z.string().min(1).max(2000),
  unansweredQuestions: z.array(z.string()).max(30),
  assumptions: z.array(z.string()).max(30),
  citedSourceIds: z.array(z.string()).max(100),
  inspectedPaths: z.array(z.string()).min(1).max(100),
});
export const Plan = PlanOutput.extend({
  id: Id,
  taskId: Id,
  projectId: Id,
  repositoryId: Id,
  version: z.number().int(),
  baseSha: Sha,
  sources: z.array(SourceRef),
  profileId: Id,
  profileDigest: z.string(),
  policyVersion: z.number(),
  digest: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  model: z.string(),
  resourceCap: z.object({ seconds: z.number(), attempts: z.number() }),
  status: z.string(),
  contextDigest: z.string(),
});
export type Plan = z.infer<typeof Plan>;
export type PlanOutput = z.infer<typeof PlanOutput>;
export const States = [
  "queued",
  "leased",
  "preparing",
  "running",
  "verifying",
  "ready_to_publish",
  "pr_open",
  "merged",
  "monitoring",
  "resolved",
  "blocked",
  "quota_paused",
  "cancelled",
  "failed",
  "superseded",
  "quarantined",
] as const;
export type JobState = (typeof States)[number];
export const CheckResult = z.object({
  id: Id,
  exitCode: z.number().int(),
  output: z.string().max(200_000),
  durationMs: z.number(),
  timedOut: z.boolean().default(false),
});
export const Artifact = z.object({
  kind: z.enum(["diff", "log", "report"]),
  content: z.string().max(2_000_000),
});
export type CheckResult = z.infer<typeof CheckResult>;
export type SourceDocument = {
  id: string;
  tenant: string;
  project_id: string;
  provider: string;
  source_key: string;
  revision: string;
  source_time: string;
  text: string;
  url: string;
  visibility: string;
  deleted: boolean;
  confirmed: boolean;
  metadata: Record<string, unknown>;
};
export type Job = {
  id: string;
  tenant: string;
  project_id: string;
  plan_id: string | null;
  kind: "repair" | "scan";
  state: JobState;
  runner_id: string | null;
  fence: number;
  lease_until: string | null;
  attempts: number;
  data: Record<string, any>;
  created_at: string;
};
