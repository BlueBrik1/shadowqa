import "dotenv/config";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Project } from "./contracts.js";
import { AppError } from "./security.js";
export const configSchema = z.object({ projects: z.array(Project) });
export async function loadConfig(
  file = process.env.SHADOWQA_CONFIG ?? "shadowqa.config.json",
) {
  const config = configSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const ids = new Set<string>(),
    repos = new Set<string>(),
    channels = new Set<string>();
  for (const p of config.projects) {
    if (ids.has(p.id) || repos.has(String(p.repository.githubId)))
      throw new AppError("CONFIG", "Duplicate project/repository mapping");
    ids.add(p.id);
    repos.add(String(p.repository.githubId));
    for (const c of p.channels) {
      if (channels.has(c.id))
        throw new AppError("CONFIG", "Ambiguous Slack channel mapping");
      channels.add(c.id);
    }
    if (
      p.profile.requiredChecks.some(
        (id) => !p.profile.checks.some((c) => c.id === id),
      )
    )
      throw new AppError(
        "CONFIG",
        "Required checks must exist in command profile",
      );
  }
  return config;
}
export const environment = () => ({
  tenant: process.env.SHADOWQA_TENANT ?? "local",
  port: Number(process.env.SHADOWQA_PORT ?? 4380),
  host: process.env.SHADOWQA_HOST ?? "127.0.0.1",
  url: process.env.SHADOWQA_URL ?? "http://127.0.0.1:4380",
  database:
    process.env.DATABASE_URL ??
    "postgresql://shadowqa:shadowqa@127.0.0.1:5432/shadowqa",
  model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  dailyCalls: Number(process.env.GEMINI_DAILY_CALLS ?? 100),
});
