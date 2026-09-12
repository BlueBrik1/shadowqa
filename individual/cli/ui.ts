import chalk from "chalk";
import { sanitize } from "../../src/core/security.js";
import {
  BRAND,
  GLYPH,
  bad,
  cyan,
  failure,
  good,
  ink,
  line,
  note,
  rule,
  soft,
  success,
  table,
} from "../../src/cli/ui.js";
import type { Plan } from "../core/contracts.js";

export {
  BRAND,
  GLYPH,
  bad,
  cyan,
  failure,
  good,
  ink,
  line,
  note,
  rule,
  soft,
  success,
  table,
};

export function banner() {
  console.log(
    ink.bold(`\n  ${GLYPH.mark} SHADOWQA`) +
      soft(" individual") +
      soft("  conversations → plan → verify → repair\n"),
  );
}

export function heading(text: string) {
  console.log("\n" + ink.bold("  " + text.toUpperCase()));
}

export function bullet(
  text: string,
  color: (s: string) => string = chalk.reset,
) {
  console.log(ink(`  ${GLYPH.step} `) + color(sanitize(text)));
}

export function warn(text: string) {
  console.log(soft("  ! ") + sanitize(text));
}

/** States are drawn in the ink; only a verified success is green and only a failure is red. */
const STATE_COLOR: Record<string, (s: string) => string> = {
  queued: soft,
  waiting_for_runner: soft,
  preparing: ink,
  running: ink,
  verifying: ink,
  ready: good,
  done: good,
  needs_review: soft,
  failed: bad,
  cancelled: soft,
};

export const stateColor = (state: string) =>
  (STATE_COLOR[state] ?? chalk.reset)(state);

export function renderPlan(
  plan: Plan & { freshness?: { fresh: boolean; reason: string } },
) {
  banner();
  line("PLAN", plan.id);
  line("STATE", plan.status);
  line("BACKEND", plan.backend);
  line("BASE", plan.baseSha);
  line("DIGEST", plan.digest);
  console.log("\n  " + ink.bold(sanitize(plan.objective)) + "\n");
  line("SCOPE", plan.scope);
  for (const step of plan.steps)
    console.log(
      ink(`  ${GLYPH.step} `) +
        sanitize(step.description) +
        (step.dependsOn.length
          ? soft(` [after ${step.dependsOn.join(", ")}]`)
          : ""),
    );
  console.log();
  line("FILES", plan.affectedPaths.join(", "));
  for (const item of plan.acceptanceCriteria)
    line("ACCEPTANCE", good(GLYPH.ok) + " " + item);
  for (const test of plan.tests) line("TEST", test);
  for (const exclusion of plan.exclusions) line("OUT OF SCOPE", exclusion);
  for (const question of plan.unresolvedQuestions)
    line("QUESTION", "? " + question);
  for (const risk of plan.risks) line("RISK", risk);
  line("ROLLBACK", plan.rollback);
  for (const source of plan.sources)
    line(
      source.confirmed ? "CONFIRMED SOURCE" : "SOURCE",
      `${source.origin} ${source.url}`,
    );
  if (plan.freshness && !plan.freshness.fresh) warn(plan.freshness.reason);
}

export function renderItems(
  items: { kind: string; text: string; status: string; id: string }[],
) {
  const order = [
    "requirement",
    "constraint",
    "decision",
    "suggestion",
    "question",
    "conflict",
  ];
  for (const kind of order) {
    const group = items.filter((i) => i.kind === kind);
    if (!group.length) continue;
    heading(kind + "s");
    for (const item of group) {
      const mark =
        item.status === "confirmed"
          ? good(GLYPH.ok)
          : item.status === "rejected"
            ? bad(GLYPH.err)
            : item.status === "answered"
              ? good("·")
              : soft("?");
      console.log(`  ${mark} ${sanitize(item.text)}`);
      console.log(soft(`      ${item.id}  ${item.status}`));
    }
  }
}
