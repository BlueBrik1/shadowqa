import { source } from "../generated/source";

/**
 * The project, plan and patch shown in the film are the repository's own regression fixture
 * (`fixtures/duplicate-submit`), not invented marketing data. `scripts/verify-fixture.mjs`
 * applies this exact patch to the extracted fixture and runs its real tests.
 */
export const project = {
  id: "payments-ui",
  name: "Payments UI",
  repository: "acme/payments-ui",
  defaultBranch: "main",
  channels: ["#payments", "#eng-frontend"],
  mode: "approval",
};

export const baseSha = "9f2c41ab7d63e0518c2b4a9f1d77ee30cb85a204";
export const planId = "plan_7QK3Ze";
export const jobId = "3f9c1d2a-7b04-4e51-9c8e-6a2f0b71d4c3";
export const planDigest = "b71e0c4d9a3f5628e10c7d84fa29b3617cc0d5e2";
export const profileDigest = "4ad9c07e1b6f38d2";
export const contextDigest = "1c7f5b02e9";

export const objective =
  "Prevent duplicate submissions when a request is already in flight";

export const planSteps = [
  {
    id: "guard",
    text: "Set the in-flight flag before awaiting save()",
    after: [],
  },
  {
    id: "release",
    text: "Keep the existing finally release path",
    after: ["guard"],
  },
  {
    id: "regress",
    text: "Run the committed duplicate-submission regression test",
    after: ["guard", "release"],
  },
];

export const acceptance = [
  "Duplicate submissions save exactly once while a request is pending",
  "A later submission still succeeds after the first completes",
];

export const sources = [
  { url: "slack://C08PAY/1738261104.882", revision: "r3", confirmed: true },
  {
    url: "github://acme/payments-ui/pull/812",
    revision: "r1",
    confirmed: true,
  },
  { url: "slack://C08PAY/1738264871.117", revision: "r1", confirmed: false },
];

export const slackMessages = [
  {
    who: "@dana · #payments",
    text: "Double-charge again. Two saves for one click.",
  },
  {
    who: "@raj · #payments",
    text: "Guard has to be set before the await, not after.",
  },
  {
    who: "@mira · #eng-frontend",
    text: "Don't touch the retry banner in this pass.",
  },
];

export const githubEvents = [
  {
    who: "PR #812 · acme/payments-ui",
    text: "checkout: add submit retry banner",
  },
  {
    who: "check_run · ci/test",
    text: "failure — duplicate submission saved twice",
  },
];

/** The repair for the extracted fixture, verified against its committed tests. */
export const patch = `diff --git a/src/submit.js b/src/submit.js
index 8c1f2a0..b4e7d31 100644
--- a/src/submit.js
+++ b/src/submit.js
@@ -1,9 +1,9 @@
 export function createSubmitter(save) {
   let pending = false;
   return async function submit(value) {
     if (pending) return false;
-    // Planted regression: the in-flight guard is never set.
+    pending = true;
     try { await save(value); return true; }
     finally { pending = false; }
   };
 }`;

export const checks = [
  { id: "test", argv: "npm test", exit: 0, ms: 4120 },
  { id: "typecheck", argv: "npm run typecheck", exit: 0, ms: 6890 },
];

export const finding = {
  id: "f_2a91c4",
  rule: "test",
  classification: "reproduced",
  occurrences: 3,
  signature: "duplicate submissions save exactly once ... expected 1, got 2",
};

export const states = [
  "queued",
  "leased",
  "preparing",
  "running",
  "verifying",
  "ready_to_publish",
  "pr_open",
] as const;

export const commands = source.commands;
export const model = source.geminiModel;
export const opencodeVersion = source.opencode;
