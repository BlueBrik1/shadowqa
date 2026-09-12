import { source } from "../generated/source";

/**
 * The individual film uses the same regression fixture as the business film, reached through a
 * different route: two browser conversations and a local Claude Code session instead of Slack
 * and GitHub. `scripts/individual-demo.ts` runs this exact path end to end.
 */
export const project = {
  id: "payments",
  name: "Payments",
  repo: "C:\\work\\payments-ui",
  mode: "approval",
  backend: "claude-code",
};

export const baseSha = "e476b9f2a1c0d3487b5e2f019acc31d75b6e8042";
export const planId = "plan_f9f68be2a1";
export const planDigest = "2f942850771349ac16b0e7f3d5c8a291";
export const taskId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
export const sessionId = "749d66b5-aa31-41a6-be23-2cec7ae28fbd";

export const conversations = [
  {
    origin: "chatgpt",
    title: "Duplicate submissions",
    turns: 4,
    coverage: "partial capture",
  },
  {
    origin: "claude",
    title: "Retry banner",
    turns: 6,
    coverage: "partial capture",
  },
  {
    origin: "claude-code",
    title: "payments-ui · session 0bf83a4e",
    turns: 41,
    coverage: "full session",
  },
  {
    origin: "codex",
    title: "rollout 019e5492",
    turns: 18,
    coverage: "full session",
  },
];

export const turns = [
  {
    who: "You · ChatGPT",
    text: "We double-charge when someone double-clicks submit.",
  },
  {
    who: "ChatGPT",
    text: "The in-flight guard has to be set before the await, not after.",
  },
  { who: "You · Claude", text: "Don't touch the retry banner in this pass." },
  {
    who: "Claude",
    text: "Understood. I could also debounce the button — up to you.",
  },
];

/** The extraction's own vocabulary; a suggestion is never promoted to a requirement. */
export const items = [
  {
    kind: "requirement",
    text: "Duplicate submissions must save exactly once while a request is pending",
    status: "confirmed",
    source: "ChatGPT · you",
  },
  {
    kind: "decision",
    text: "Set the in-flight guard before the await, not after",
    status: "confirmed",
    source: "ChatGPT · assistant, you accepted it",
  },
  {
    kind: "constraint",
    text: "Do not change the retry banner in this pass",
    status: "confirmed",
    source: "Claude · you",
  },
  {
    kind: "suggestion",
    text: "Consider a debounce on the button as well",
    status: "proposed",
    source: "Claude · assistant only",
  },
  {
    kind: "question",
    text: "Should a failed save re-enable the button immediately?",
    status: "open",
    source: "nothing answers it",
  },
];

export const planSteps = [
  {
    id: "guard",
    text: "Assign pending = true before awaiting save(value)",
    after: [],
  },
  {
    id: "regress",
    text: "Run the committed duplicate-submission test",
    after: ["guard"],
  },
];

export const acceptance = [
  "Duplicate submissions save exactly once while a request is pending",
  "A later submission still succeeds after the first completes",
];

export const backendRows = [
  {
    id: "opencode",
    label: "OpenCode",
    detail: "Driven by your Gemini key",
    attach: 'opencode run --dir "<workspace>" -s <session> -c',
  },
  {
    id: "claude-code",
    label: "Claude Code",
    detail: "Your own Claude sign-in",
    attach: "claude --resume <session-id>",
  },
  {
    id: "codex",
    label: "Codex",
    detail: "Your own OpenAI sign-in",
    attach: "codex resume <session-id>",
  },
];

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

export const checks = [{ id: "test", argv: "node --test", exit: 0, ms: 212 }];

export const model = source.geminiModel;
export const commands = source.individualCommands;
export const moduleCount = source.moduleCount.individual;
