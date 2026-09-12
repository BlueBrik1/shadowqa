// One-shot codemod: removes the unused import specifiers TypeScript reports, so the compositions
// compile under the same noUnusedLocals rule as the rest of the repository.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(
  path.dirname(
    new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  ),
  "..",
);

let output = "";
try {
  execSync("npx tsc --noEmit", { cwd: root, encoding: "utf8" });
} catch (error) {
  output = error.stdout ?? "";
}

const byFile = new Map();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS(6133|6192): (.*)$/);
  if (!match) continue;
  const [, file, row, col, code, message] = match;
  const name = message.match(/'([^']+)' is declared/)?.[1];
  if (code === "6133" && !name) continue;
  const list = byFile.get(file) ?? [];
  list.push({ row: Number(row), col: Number(col), code, name });
  byFile.set(file, list);
}

let removed = 0;
for (const [file, entries] of byFile) {
  const full = path.join(root, file);
  let text = readFileSync(full, "utf8");
  const declaration = 6192;
  // Whole-declaration removals first, then individual specifiers.
  for (const entry of entries.filter((e) => Number(e.code) === declaration)) {
    const lines = text.split("\n");
    let end = entry.row - 1;
    while (end < lines.length && !/;\s*$/.test(lines[end])) end++;
    lines.splice(entry.row - 1, end - entry.row + 2);
    text = lines.join("\n");
    removed++;
  }
  for (const entry of entries.filter((e) => Number(e.code) !== declaration)) {
    const before = text;
    // Inside a braced import list: `A, Name,` / `Name, ` / `, Name`
    text = text.replace(
      new RegExp(`(import[^;]*?\\{[^}]*?)\\b${entry.name}\\b,\\s*`, "s"),
      "$1",
    );
    if (text === before)
      text = text.replace(
        new RegExp(`(import[^;]*?\\{[^}]*?),\\s*\\b${entry.name}\\b`, "s"),
        "$1",
      );
    if (text !== before) removed++;
  }
  writeFileSync(full, text);
}
console.log(
  `removed ${removed} unused import(s) across ${byFile.size} file(s)`,
);
