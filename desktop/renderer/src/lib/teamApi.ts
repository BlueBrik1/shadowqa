export type TeamConfig = { apiUrl: string; token: string };

let cached: TeamConfig | undefined | null = null;

export async function teamConfig(): Promise<TeamConfig | undefined> {
  if (cached === null) cached = (await window.shadowqa.team.getConfig()) ?? undefined;
  return cached;
}
export function invalidateTeamConfig() {
  cached = null;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function teamApi<T = any>(route: string, method = "GET", body?: unknown): Promise<T> {
  const cfg = await teamConfig();
  if (!cfg) throw new ApiError("NOT_CONNECTED", "No team service is connected yet");
  const response = await fetch(cfg.apiUrl + route, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.code ?? "API", result.message ?? `HTTP ${response.status}`);
  return result;
}
