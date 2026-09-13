export type Config = {
  apiUrl: string;
  token: string;
  database: string;
  backends: { id: string; label: string; available: boolean; version?: string; reason?: string }[];
};

declare global {
  interface Window {
    shadowqa: {
      getConfig(): Promise<Config>;
      pickFolder(): Promise<string | undefined>;
      openExternal(url: string): Promise<void>;
      keychain: {
        get(id: string): Promise<string | undefined>;
        set(id: string, value: string): Promise<void>;
        delete(id: string): Promise<void>;
      };
      github: {
        connect(): Promise<{ appId: string; slug: string; htmlUrl: string }>;
        installations(): Promise<{ slug: string; installations: any[] }>;
        repositories(installationId: number): Promise<any[]>;
        verifyClone(folder: string, owner: string, name: string): Promise<string>;
      };
      slack: {
        verify(botToken: string, appToken: string): Promise<{ team: string; user: string; url: string }>;
        channels(): Promise<{ id: string; name: string; private: boolean }[]>;
      };
      live: {
        start(autonomy?: string): Promise<{ alreadyRunning: boolean }>;
        stop(): Promise<void>;
        running(): Promise<boolean>;
        call(route: string, method?: string, body?: unknown): Promise<any>;
        snippet(): Promise<string>;
      };
      companion: {
        status(): Promise<{ installed: boolean; extensionId?: string }>;
        install(extensionId: string): Promise<{ installedFor: string[]; skipped: { browser: string; reason: string }[] }>;
        uninstall(): Promise<void>;
      };
      team: {
        dockerComposeUp(): Promise<void>;
        status(): Promise<{ running: boolean }>;
        start(databaseUrl?: string): Promise<{ url: string; token: string }>;
        join(url: string, token: string): Promise<{ id: string; role: string }>;
        getConfig(): Promise<{ apiUrl: string; token: string } | undefined>;
        watchStart(projectId: string, folder: string): Promise<{ alreadyWatching: boolean }>;
        watchStop(projectId: string): Promise<void>;
        watchEvents(projectId: string): Promise<{ watching: boolean; events: any[] }>;
      };
    };
  }
}

let cached: Config | undefined;
export async function config(): Promise<Config> {
  if (!cached) cached = await window.shadowqa.getConfig();
  return cached;
}
/** The Gemini-key path reboots the local service, which changes its port/token; forget the cache. */
export function invalidateConfig() {
  cached = undefined;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The same thin REST wrapper the CLI's `Client` class was — a plain fetch against the local
 * service, bearer-authenticated with the owner token from the OS keychain-backed main process. */
export async function api<T = any>(route: string, method = "GET", body?: unknown): Promise<T> {
  const { apiUrl, token } = await config();
  const response = await fetch(apiUrl + route, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.code ?? "API", result.message ?? `HTTP ${response.status}`);
  return result;
}
