import chalk from "chalk";
import type { Plan } from "../core/contracts.js";
import { sanitize } from "../core/security.js";
/**
 * ShadowQA brand, in the terminal.
 *
 * Two colours only: charcoal (`#1C1C1C`) and off-white (`#F4F1EA`). Red marks a failure, green
 * marks a verified success; nothing else is coloured. The same two values are read by the
 * film (`video/scripts/extract.mjs`), the side panel, the Live overlay and the slides, so every
 * surface is the same product by construction.
 */
export const BRAND = { charcoal: "#1C1C1C", offwhite: "#F4F1EA" } as const;
export const ink = chalk.hex(BRAND.offwhite);
export const soft = chalk.hex("#A9A59D");
export const bad = chalk.hex("#E5484D");
export const good = chalk.hex("#3DD68C");
/** Kept for callers that imported the old accent; it now resolves to the off-white ink. */
export const cyan = ink;
export const GLYPH = {
  mark: "◈",
  step: "◇",
  ok: "✓",
  err: "✕",
  live: "◉",
  watch: "◌",
} as const;
export function banner(edition?: string) {
  console.log(
    ink.bold(`\n  ${GLYPH.mark} SHADOWQA`) +
      (edition ? soft(" " + edition) : "") +
      soft("  observe → plan → verify → repair\n"),
  );
}
export function line(label: string, value: unknown) {
  console.log("  " + soft(label.padEnd(18)) + sanitize(String(value)));
}
export function success(text: string) {
  console.log(good(`  ${GLYPH.ok} `) + text);
}
export function failure(text: string) {
  console.error(bad(`  ${GLYPH.err} `) + sanitize(text));
}
export function note(text: string) {
  console.log(soft("    " + sanitize(text)));
}
export function rule(width = 56) {
  console.log(soft("  " + "─".repeat(width)));
}
export function table(rows: Record<string, unknown>[], columns: string[]) {
  if (!rows.length) {
    console.log(soft("  Nothing here yet."));
    return;
  }
  const widths = columns.map((c) =>
    Math.min(
      52,
      Math.max(c.length, ...rows.map((r) => String(r[c] ?? "—").length)),
    ),
  );
  console.log(
    "  " +
      columns.map((c, i) => soft(c.toUpperCase().padEnd(widths[i]))).join("  "),
  );
  for (const row of rows)
    console.log(
      "  " +
        columns
          .map((c, i) =>
            sanitize(String(row[c] ?? "—"))
              .slice(0, widths[i])
              .padEnd(widths[i]),
          )
          .join("  "),
    );
}
export function renderPlan(plan: Plan) {
  banner();
  line("PLAN", plan.id);
  line("STATE", plan.status);
  line("BASE", plan.baseSha);
  line("DIGEST", plan.digest);
  console.log("\n  " + ink.bold(sanitize(plan.objective)) + "\n");
  for (const step of plan.steps)
    console.log(
      ink(`  ${GLYPH.step} `) +
        sanitize(step.description) +
        (step.dependsOn.length
          ? soft(` [after ${step.dependsOn.join(", ")}]`)
          : ""),
    );
  console.log();
  line("FILES", plan.expectedPaths.join(", "));
  line("CHECK PROFILE", plan.profileId);
  line(
    "LIMIT",
    `${plan.resourceCap.seconds}s / ${plan.resourceCap.attempts} attempts`,
  );
  for (const item of plan.acceptanceCriteria)
    line("ACCEPTANCE", good(GLYPH.ok) + " " + item);
  line("REGRESSION", plan.regressionStrategy);
  line("ROLLBACK", plan.rollback);
  for (const question of plan.unansweredQuestions)
    line("QUESTION", "? " + question);
  for (const risk of plan.riskFlags) line("REVIEW", risk);
  for (const assumption of plan.assumptions) line("ASSUMPTION", assumption);
  for (const source of plan.sources)
    line(
      source.confirmed ? "CONFIRMED SOURCE" : "SOURCE",
      `${source.url} @ ${source.revision}`,
    );
}
