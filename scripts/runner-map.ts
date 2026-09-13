#!/usr/bin/env node
/**
 * Reviews and consents to one repository mapping on a runner machine: shows the exact command
 * profile and sandbox image digest that will run this project's checks, and only writes the
 * mapping after an explicit yes. Run on the same machine `scripts/runner-start.ts` runs on.
 *
 *   npx tsx scripts/runner-map.ts <project-id> <local-folder> [--accept-profile]
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runnerRoot, loadMappings } from "../src/runner/runner.js";
import { Sandbox } from "../src/runner/sandbox.js";
import { run } from "../src/runner/process.js";
import { inspect } from "../src/planner/inspect.js";
import { Client } from "../src/core/client.js";
import { environment } from "../src/core/config.js";
import { hash } from "../src/core/security.js";
import type { Project } from "../src/core/contracts.js";

const [id, folder] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!id || !folder) throw new Error("Usage: runner-map.ts <project-id> <local-folder> [--accept-profile]");

const env = environment();
const projects = await new Client(env.url, undefined, "runner").call<Project[]>("/projects");
const project = projects.find((p) => p.id === id);
if (!project) throw new Error("Project not found");
project.repository.localPath = path.resolve(folder);
await inspect(project);
await new Sandbox("shadowqa-map", project.profile).doctor();
const image = await run("docker", ["image", "inspect", "--format", "{{.Id}}", project.profile.image]);
if (image.code !== 0) throw new Error("Sandbox image is unavailable");
console.log(JSON.stringify(project.profile, null, 2));
console.log("IMAGE DIGEST:", image.stdout.trim());

if (!process.argv.includes("--accept-profile")) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question("Allow this exact command profile to run in isolated Docker containers? [y/N] ");
  rl.close();
  if (answer.trim().toLowerCase() !== "y") process.exit(0);
}

const mappings = await loadMappings();
const next = [
  ...mappings.filter((m) => m.projectId !== id),
  { projectId: id, path: path.resolve(folder), profileDigest: hash(project.profile), imageId: image.stdout.trim() },
];
await mkdir(runnerRoot(), { recursive: true });
await writeFile(path.join(runnerRoot(), "mappings.json"), JSON.stringify(next, null, 2));
console.log("Repository mapping saved.");
