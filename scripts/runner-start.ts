#!/usr/bin/env node
/**
 * Headless entrypoint for a team execution runner — a dedicated machine with Docker that leases
 * approved jobs and runs them in the network-disabled sandbox. Register it once from the desktop
 * app's Admin tab (issues a runner credential into this machine's OS keyring), map at least one
 * repository with `scripts/runner-map.ts`, then run this and leave it running.
 */
import "dotenv/config";
import { Runner, loadMappings } from "../src/runner/runner.js";
import { Client, credential, credentialKey } from "../src/core/client.js";
import { environment } from "../src/core/config.js";

const env = environment();
// Register this machine from the desktop app's Admin tab, then either export
// SHADOWQA_RUNNER_TOKEN=<token> once, or store it here permanently:
if (process.argv.includes("--save-token")) {
  const raw = process.env.SHADOWQA_RUNNER_TOKEN;
  if (!raw) throw new Error("Set SHADOWQA_RUNNER_TOKEN to the token to save, then run with --save-token once.");
  await credentialKey(env.url, "runner").setPassword(raw);
  console.log("Runner credential saved to OS keyring.");
}
const token = await credential(env.url, "runner");
const mappings = await loadMappings();
if (!mappings.length) throw new Error("No repository mapped yet. Run scripts/runner-map.ts first.");

const runner = new Runner(new Client(env.url, token, "runner"), mappings);
process.once("SIGINT", () => runner.stop());
process.once("SIGTERM", () => runner.stop());
console.log(`Runner started against ${env.url}, watching ${mappings.length} repository mapping(s).`);
await runner.start(process.argv.includes("--once"));
