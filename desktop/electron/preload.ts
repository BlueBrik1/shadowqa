import { contextBridge, ipcRenderer } from "electron";

/** The only surface the renderer gets into the main process: folder picking, opening a system
 * browser link, and OS-keychain credential storage. Everything else is plain `fetch` to the local
 * API, exactly like the CLI's own client did. */
contextBridge.exposeInMainWorld("shadowqa", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  keychain: {
    get: (id: string) => ipcRenderer.invoke("keychain-get", id),
    set: (id: string, value: string) => ipcRenderer.invoke("keychain-set", id, value),
    delete: (id: string) => ipcRenderer.invoke("keychain-delete", id),
  },
  github: {
    connect: () => ipcRenderer.invoke("github-connect"),
    installations: () => ipcRenderer.invoke("github-installations"),
    repositories: (installationId: number) => ipcRenderer.invoke("github-repositories", installationId),
    verifyClone: (folder: string, owner: string, name: string) =>
      ipcRenderer.invoke("github-verify-clone", folder, owner, name),
  },
  slack: {
    verify: (botToken: string, appToken: string) => ipcRenderer.invoke("slack-verify", botToken, appToken),
    channels: () => ipcRenderer.invoke("slack-channels"),
  },
  live: {
    start: (autonomy?: string) => ipcRenderer.invoke("live-start", autonomy),
    stop: () => ipcRenderer.invoke("live-stop"),
    running: () => ipcRenderer.invoke("live-running"),
    call: (route: string, method?: string, body?: unknown) => ipcRenderer.invoke("live-call", route, method, body),
    snippet: () => ipcRenderer.invoke("live-snippet"),
  },
  companion: {
    status: () => ipcRenderer.invoke("companion-status"),
    install: (extensionId: string) => ipcRenderer.invoke("companion-install", extensionId),
    uninstall: () => ipcRenderer.invoke("companion-uninstall"),
  },
  team: {
    dockerComposeUp: () => ipcRenderer.invoke("docker-compose-up"),
    status: () => ipcRenderer.invoke("team-status"),
    start: (databaseUrl?: string) => ipcRenderer.invoke("team-start", databaseUrl),
    join: (url: string, token: string) => ipcRenderer.invoke("team-join", url, token),
    getConfig: () => ipcRenderer.invoke("get-team-config"),
    watchStart: (projectId: string, folder: string) => ipcRenderer.invoke("team-watch-start", projectId, folder),
    watchStop: (projectId: string) => ipcRenderer.invoke("team-watch-stop", projectId),
    watchEvents: (projectId: string) => ipcRenderer.invoke("team-watch-events", projectId),
  },
});
