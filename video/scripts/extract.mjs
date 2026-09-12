// Pulls verbatim text out of the ShadowQA source tree so every code element on screen is
// the real thing. Anchors are matched at build time; a moved or renamed anchor fails loudly
// rather than letting the video drift away from the product.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.resolve(here, "..", "src", "generated");

/**
 * key      identifier used by the compositions
 * file     repository-relative path
 * anchor   first line to include, matched as a regular expression
 * lines    number of lines to take from the anchor
 * lang     Prism language id
 */
const snippets = [
  {
    key: "brand",
    file: "src/cli/ui.ts",
    anchor: /^export const BRAND/,
    lines: 6,
    lang: "typescript",
  },
  {
    key: "modeEnum",
    file: "src/core/contracts.ts",
    anchor: /^export const Mode = z\.enum/,
    lines: 1,
    lang: "typescript",
  },
  {
    key: "jobStates",
    file: "src/core/contracts.ts",
    anchor: /^export const States = \[/,
    lines: 19,
    lang: "typescript",
  },
  {
    key: "planShape",
    file: "src/core/contracts.ts",
    anchor: /^export const Plan = PlanOutput\.extend/,
    lines: 19,
    lang: "typescript",
  },
  {
    key: "modeHelp",
    file: "src/cli/setup.ts",
    anchor: /^export const MODE_HELP/,
    lines: 8,
    lang: "typescript",
  },
  {
    key: "slackChannels",
    file: "src/cli/setup.ts",
    anchor: /^export async function slackChannels/,
    lines: 19,
    lang: "typescript",
  },
  {
    key: "verifyClone",
    file: "src/cli/setup.ts",
    anchor: /^export async function verifyClone/,
    lines: 16,
    lang: "typescript",
  },
  {
    key: "modelQuota",
    file: "src/model/gemini.ts",
    anchor: /^  async reserve/,
    lines: 13,
    lang: "typescript",
  },
  {
    key: "citation",
    file: "src/planner/planner.ts",
    anchor: /if \(output\.citedSourceIds\.some/,
    lines: 2,
    lang: "typescript",
  },
  {
    key: "patchRisk",
    file: "src/policy/engine.ts",
    anchor:
      /if \(line\.startsWith\("\+"\) && !line\.startsWith\("\+\+\+"\)\) \{/,
    lines: 10,
    lang: "typescript",
  },
  {
    key: "testWeakening",
    file: "src/policy/engine.ts",
    anchor: /if \(line\.startsWith\("-"\) && !line\.startsWith\("---"\)\) \{/,
    lines: 8,
    lang: "typescript",
  },
  {
    key: "lease",
    file: "src/scheduler/jobs.ts",
    anchor: /"UPDATE jobs SET state='leased'/,
    lines: 3,
    lang: "typescript",
  },
  {
    key: "isolation",
    file: "src/runner/sandbox.ts",
    anchor: /^  private flags\(workspace: string\) \{/,
    lines: 19,
    lang: "typescript",
  },
  {
    key: "fingerprint",
    file: "src/qa/findings.ts",
    anchor: /const signature = sanitize\(check\.output\)/,
    lines: 7,
    lang: "typescript",
  },
  {
    key: "buggy",
    file: "fixtures/duplicate-submit/src/submit.js",
    anchor: /^export function createSubmitter/,
    lines: 9,
    lang: "javascript",
  },
  {
    key: "regressionTest",
    file: "fixtures/duplicate-submit/tests/submit.test.js",
    anchor: /^test\('duplicate submissions/,
    lines: 11,
    lang: "javascript",
  },
  {
    key: "schemaJobs",
    file: "src/db/schema.ts",
    anchor: /^CREATE TABLE IF NOT EXISTS jobs/,
    lines: 7,
    lang: "sql",
  },
];

// Individual-version anchors are optional until that tree exists, so the business video can be
// extracted and rendered on its own.
const optionalSnippets = [
  {
    key: "captureMessage",
    file: "individual/core/contracts.ts",
    anchor: /^export const CapturedMessage/,
    lines: 16,
    lang: "typescript",
  },
  {
    key: "chatgptAdapter",
    file: "individual/extension/src/content/adapters/chatgpt.ts",
    anchor: /^export const chatgpt: SiteAdapter/,
    lines: 22,
    lang: "typescript",
  },
  {
    key: "claudeAdapter",
    file: "individual/extension/src/content/adapters/claude.ts",
    anchor: /^export const claude: SiteAdapter/,
    lines: 22,
    lang: "typescript",
  },
  {
    key: "dedupe",
    file: "individual/core/dedupe.ts",
    anchor: /^export function messageKey/,
    lines: 10,
    lang: "typescript",
  },
  {
    key: "nativeHost",
    file: "individual/companion/src/native-messaging.ts",
    anchor: /^export function readFrame/,
    lines: 8,
    lang: "typescript",
  },
  {
    key: "claudeCodeTranscript",
    file: "individual/companion/src/adapters/claude-code.ts",
    anchor: /^export function transcriptRoot/,
    lines: 10,
    lang: "typescript",
  },
  {
    key: "codexSessions",
    file: "individual/companion/src/adapters/codex.ts",
    anchor: /^export function sessionRoot/,
    lines: 10,
    lang: "typescript",
  },
  {
    key: "backends",
    file: "individual/core/contracts.ts",
    anchor: /^export const Backend = z\.enum/,
    lines: 1,
    lang: "typescript",
  },
  {
    key: "extractionPrompt",
    file: "individual/core/extract.ts",
    anchor: /^export const EXTRACTION_SYSTEM/,
    lines: 12,
    lang: "typescript",
  },
  {
    key: "manifest",
    file: "individual/extension/manifest.json",
    anchor: /"permissions"/,
    lines: 9,
    lang: "json",
  },
  // ShadowQA Live — the runtime half of the product.
  {
    key: "modeToAutonomy",
    file: "live/backend/shadowqa/config.py",
    anchor: /^MODE_TO_AUTONOMY = \{/,
    lines: 6,
    lang: "python",
  },
  {
    key: "sensitivePaths",
    file: "live/backend/shadowqa/risk.py",
    anchor: /^SENSITIVE_PATH = \[/,
    lines: 6,
    lang: "python",
  },
  {
    key: "liveRepair",
    file: "src/qa/repair.ts",
    anchor: /^  if \(isLiveFinding\(existing\)\) \{/,
    lines: 8,
    lang: "typescript",
  },
  {
    key: "liveRoutes",
    file: "src/live/bridge.ts",
    anchor: /^ \*   GET  \/live\/policy\/:project/,
    lines: 5,
    lang: "typescript",
  },
  {
    key: "liveProviders",
    file: "live/backend/shadowqa/config.py",
    anchor: /self\.primary_model = os\.environ\.get/,
    lines: 2,
    lang: "python",
  },
];

function dedent(lines) {
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => l.length - l.trimStart().length);
  const strip = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(strip));
}

async function extract(list, { required }) {
  const result = {};
  const missing = [];
  for (const snippet of list) {
    let text;
    try {
      text = await readFile(path.join(repo, snippet.file), "utf8");
    } catch {
      missing.push(snippet.key + " (" + snippet.file + " not found)");
      continue;
    }
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((l) => snippet.anchor.test(l));
    if (start < 0) {
      missing.push(snippet.key + " (anchor not found in " + snippet.file + ")");
      continue;
    }
    const slice = dedent(lines.slice(start, start + snippet.lines));
    result[snippet.key] = {
      file: snippet.file,
      line: start + 1,
      lang: snippet.lang,
      code: slice.join("\n").trimEnd(),
    };
  }
  if (required && missing.length)
    throw new Error("Source anchors are stale:\n  " + missing.join("\n  "));
  return { result, missing };
}

// Real CLI surface, read from the command registrations rather than retyped.
async function commands() {
  const text = await readFile(path.join(repo, "src/cli/main.ts"), "utf8");
  const found = [
    ...text.matchAll(/\.command\("([a-z-]+)(?: [<[][^"]*)?"\)/g),
  ].map((m) => m[1]);
  return [...new Set(found)];
}

async function individualCommands() {
  try {
    const text = await readFile(
      path.join(repo, "individual/cli/main.ts"),
      "utf8",
    );
    const found = [
      ...text.matchAll(/\.command\("([a-z-]+)(?: [<[][^"]*)?"\)/g),
    ].map((m) => m[1]);
    return [...new Set(found)];
  } catch {
    return [];
  }
}

async function pkg(file) {
  try {
    return JSON.parse(await readFile(path.join(repo, file), "utf8"));
  } catch {
    return {};
  }
}

async function fileCount(dir) {
  let total = 0;
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) total++;
    }
  };
  await walk(path.join(repo, dir));
  return total;
}

const business = await extract(snippets, { required: true });
const individual = await extract(optionalSnippets, { required: false });
const root = await pkg("package.json");

const payload = {
  generatedAt: new Date().toISOString(),
  version: root.version ?? "0.0.0",
  opencode: root.dependencies?.["@opencode-ai/sdk"] ?? "unknown",
  geminiModel: "gemini-2.5-flash",
  snippets: { ...business.result, ...individual.result },
  missingIndividual: individual.missing,
  commands: await commands(),
  individualCommands: await individualCommands(),
  moduleCount: {
    business: await fileCount("src"),
    individual: await fileCount("individual"),
  },
};

await mkdir(out, { recursive: true });
await writeFile(
  path.join(out, "source.ts"),
  "// Generated by video/scripts/extract.mjs. Do not edit; run `npm run extract`.\n" +
    "export const source = " +
    JSON.stringify(payload, null, 2) +
    " as const;\n" +
    "export type Snippet = { file: string; line: number; lang: string; code: string };\n" +
    "export const snippet = (key: keyof typeof source.snippets): Snippet =>\n" +
    "  source.snippets[key] as Snippet;\n",
  "utf8",
);

console.log(
  `extracted ${Object.keys(payload.snippets).length} snippets, ${payload.commands.length} business commands` +
    (individual.missing.length
      ? `, ${individual.missing.length} individual anchors pending`
      : ""),
);
