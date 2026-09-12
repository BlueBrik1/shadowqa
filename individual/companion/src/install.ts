import { mkdir, writeFile, chmod, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../../src/runner/process.js";
import { AppError } from "../../../src/core/security.js";
import { workRoot } from "../../core/execute.js";

export const HOST_NAME = "com.shadowqa.individual";

/** Chrome-family browsers that read native-messaging host manifests from their own user data. */
const BROWSERS = {
  win32: {
    chrome: "Software\\Google\\Chrome\\NativeMessagingHosts",
    edge: "Software\\Microsoft\\Edge\\NativeMessagingHosts",
    chromium: "Software\\Chromium\\NativeMessagingHosts",
  },
  darwin: {
    chrome: "Library/Application Support/Google/Chrome/NativeMessagingHosts",
    edge: "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
    chromium: "Library/Application Support/Chromium/NativeMessagingHosts",
  },
  linux: {
    chrome: ".config/google-chrome/NativeMessagingHosts",
    edge: ".config/microsoft-edge/NativeMessagingHosts",
    chromium: ".config/chromium/NativeMessagingHosts",
  },
} as const;

export function hostScriptPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "host.js");
}

export function launcherPath() {
  return path.join(
    workRoot(),
    process.platform === "win32"
      ? "shadowqa-companion.bat"
      : "shadowqa-companion.sh",
  );
}

export function manifestPath() {
  return path.join(workRoot(), HOST_NAME + ".json");
}

/**
 * Chrome launches the host directly, so the manifest must point at something the OS can execute.
 * A tiny launcher keeps the Node path, the script path and stdio wiring in one reviewable file.
 */
export async function writeLauncher() {
  const script = hostScriptPath();
  const node = process.execPath;
  const file = launcherPath();
  await mkdir(path.dirname(file), { recursive: true });
  if (process.platform === "win32")
    await writeFile(file, `@echo off\r\n"${node}" "${script}" %*\r\n`, "utf8");
  else {
    await writeFile(
      file,
      `#!/bin/sh\nexec "${node}" "${script}" "$@"\n`,
      "utf8",
    );
    await chmod(file, 0o755);
  }
  return file;
}

export type InstallResult = {
  manifest: string;
  launcher: string;
  installedFor: string[];
  skipped: { browser: string; reason: string }[];
  extensionId: string;
};

export async function installHost(extensionId: string): Promise<InstallResult> {
  if (!/^[a-p]{32}$/.test(extensionId))
    throw new AppError(
      "EXTENSION_ID",
      "Expected a 32-character Chrome extension id (chrome://extensions shows it after you load the folder unpacked).",
    );
  const launcher = await writeLauncher();
  const manifest = {
    name: HOST_NAME,
    description: "ShadowQA Individual local companion",
    path: launcher,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  const file = manifestPath();
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const installedFor: string[] = [];
  const skipped: { browser: string; reason: string }[] = [];

  if (process.platform === "win32") {
    for (const [browser, key] of Object.entries(BROWSERS.win32)) {
      const result = await run(
        "reg",
        [
          "add",
          `HKCU\\${key}\\${HOST_NAME}`,
          "/ve",
          "/t",
          "REG_SZ",
          "/d",
          file,
          "/f",
        ],
        { timeoutMs: 20_000 },
      );
      if (result.code === 0) installedFor.push(browser);
      else
        skipped.push({
          browser,
          reason: (result.stderr || result.stdout).trim().slice(0, 200),
        });
    }
  } else {
    const table =
      process.platform === "darwin" ? BROWSERS.darwin : BROWSERS.linux;
    for (const [browser, dir] of Object.entries(table)) {
      const target = path.join(os.homedir(), dir);
      try {
        await mkdir(target, { recursive: true });
        await writeFile(
          path.join(target, HOST_NAME + ".json"),
          JSON.stringify(manifest, null, 2) + "\n",
        );
        installedFor.push(browser);
      } catch (e) {
        skipped.push({
          browser,
          reason: String((e as Error).message).slice(0, 200),
        });
      }
    }
  }
  return { manifest: file, launcher, installedFor, skipped, extensionId };
}

export async function uninstallHost() {
  const removed: string[] = [];
  if (process.platform === "win32") {
    for (const [browser, key] of Object.entries(BROWSERS.win32)) {
      const result = await run(
        "reg",
        ["delete", `HKCU\\${key}\\${HOST_NAME}`, "/f"],
        {
          timeoutMs: 20_000,
        },
      );
      if (result.code === 0) removed.push(browser);
    }
  } else {
    const table =
      process.platform === "darwin" ? BROWSERS.darwin : BROWSERS.linux;
    for (const [browser, dir] of Object.entries(table)) {
      const file = path.join(os.homedir(), dir, HOST_NAME + ".json");
      try {
        await rm(file, { force: true });
        removed.push(browser);
      } catch {
        /* not installed for this browser */
      }
    }
  }
  await rm(manifestPath(), { force: true }).catch(() => {});
  return { removed };
}

export async function hostStatus() {
  const file = manifestPath();
  try {
    const manifest = JSON.parse(await readFile(file, "utf8"));
    return {
      installed: true,
      manifest: file,
      extensionId: String(manifest.allowed_origins?.[0] ?? "")
        .replace("chrome-extension://", "")
        .replace("/", ""),
      launcher: manifest.path as string,
    };
  } catch {
    return {
      installed: false,
      manifest: file,
      extensionId: "",
      launcher: launcherPath(),
    };
  }
}
