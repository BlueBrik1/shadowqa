import { z } from "zod";
import type { Database } from "../db/database.js";
import { AppError, hash, sanitize } from "../core/security.js";
export interface Model {
  name: string;
  generate<T>(
    tenant: string,
    project: string,
    system: string,
    input: unknown,
    schema: z.ZodType<T>,
  ): Promise<T>;
}
export class Gemini implements Model {
  constructor(
    private db: Database,
    public name = process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    private apiKey = process.env.GEMINI_API_KEY ?? "",
    private dailyCap = Number(process.env.GEMINI_DAILY_CALLS ?? 100),
    private fetcher: typeof fetch = fetch,
  ) {}
  async reserve(tenant: string) {
    const row = await this.db.one(
      `INSERT INTO model_usage(tenant,calls) VALUES($1,1)
      ON CONFLICT(tenant,day) DO UPDATE SET calls=model_usage.calls+1 WHERE model_usage.calls<$2 RETURNING calls`,
      [tenant, this.dailyCap],
    );
    if (!row)
      throw new AppError(
        "QUOTA_PAUSED",
        "Daily Gemini call budget reached; retry after UTC midnight",
        429,
      );
  }
  async generate<T>(
    tenant: string,
    project: string,
    system: string,
    input: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    if (!this.apiKey)
      throw new AppError(
        "MODEL_SETUP",
        "Set GEMINI_API_KEY before compiling context",
        503,
      );
    const clean = sanitize(JSON.stringify(input));
    if (clean.length > 180_000)
      throw new AppError(
        "CONTEXT_CAP",
        "Context exceeds the bounded model input limit",
      );
    const key = hash({
      model: this.name,
      system,
      input: clean,
      schema: z.toJSONSchema(schema),
    });
    const cached = await this.db.get<{ output: unknown }>(
      tenant,
      "model-cache",
      key,
    );
    if (cached) return schema.parse(cached.output);
    let repair = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.reserve(tenant);
      const response = await this.fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.name)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: clean + repair }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
              responseJsonSchema: z.toJSONSchema(schema),
            },
          }),
        },
      );
      if (response.status === 429)
        throw new AppError(
          "QUOTA_PAUSED",
          `Gemini quota exhausted; retry later${response.headers.get("retry-after") ? " (Retry-After " + response.headers.get("retry-after") + "s)" : ""}. Billing is never enabled by ShadowQA.`,
          429,
        );
      if (!response.ok)
        throw new AppError(
          "MODEL_FAILED",
          `Gemini returned HTTP ${response.status}`,
          502,
        );
      const body: any = await response.json();
      const output =
        body.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text ?? "")
          .join("") ?? "";
      await this.db.rows(
        "UPDATE model_usage SET input_tokens=input_tokens+$2,output_tokens=output_tokens+$3 WHERE tenant=$1 AND day=CURRENT_DATE",
        [
          tenant,
          body.usageMetadata?.promptTokenCount ?? 0,
          body.usageMetadata?.candidatesTokenCount ?? 0,
        ],
      );
      try {
        const parsed = schema.parse(JSON.parse(output));
        await this.db.put(
          tenant,
          "model-cache",
          key,
          { output: parsed, model: this.name },
          project,
        );
        return parsed;
      } catch {
        repair =
          "\nYour previous output failed the required schema. Produce one valid JSON object matching the schema. No Markdown.";
      }
    }
    throw new AppError(
      "MODEL_SCHEMA",
      "Gemini returned invalid structured output twice; no plan was authorized",
      502,
    );
  }
}
