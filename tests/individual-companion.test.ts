import { describe, expect, test } from "vitest";
import { PassThrough } from "node:stream";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  readFrame,
  writeFrame,
  serve,
} from "../individual/companion/src/native-messaging.js";
import {
  createPairingCode,
  identify,
  redeemPairingCode,
  requireOwner,
} from "../individual/service/auth.js";
import * as claudeCode from "../individual/companion/src/adapters/claude-code.js";
import * as codex from "../individual/companion/src/adapters/codex.js";
import { testStore } from "./individual-helpers.js";

describe("native messaging framing", () => {
  test("a frame round-trips", () => {
    const frame = writeFrame({ type: "ping", extensionId: "abc" });
    const read = readFrame(frame);
    expect(read?.message).toEqual({ type: "ping", extensionId: "abc" });
    expect(read?.rest.length).toBe(0);
  });

  test("a partial frame is not consumed", () => {
    const frame = writeFrame({ hello: "world" });
    expect(readFrame(frame.subarray(0, 3))).toBeUndefined();
    expect(readFrame(frame.subarray(0, frame.length - 1))).toBeUndefined();
  });

  test("two frames in one chunk are both read", () => {
    const both = Buffer.concat([writeFrame({ n: 1 }), writeFrame({ n: 2 })]);
    const first = readFrame(both)!;
    expect(first.message).toEqual({ n: 1 });
    expect(readFrame(first.rest)!.message).toEqual({ n: 2 });
  });

  test("an oversized declared length is rejected rather than allocated", () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(0xffffffff, 0);
    expect(() => readFrame(Buffer.concat([header, Buffer.alloc(8)]))).toThrow(
      /64 MB/,
    );
  });

  test("a reply bigger than Chrome's 1 MB limit is refused", () => {
    expect(() => writeFrame({ blob: "x".repeat(2_000_000) })).toThrow(/1 MB/);
  });

  test("a handler failure becomes an error reply, not a crashed host", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (c) => chunks.push(c));
    const done = serve(
      async (message) => {
        if (message.type === "boom") throw new Error("nope");
        return { echoed: message.type };
      },
      input,
      output,
    );
    input.write(writeFrame({ id: 1, type: "boom" }));
    input.write(writeFrame({ id: 2, type: "ok" }));
    input.end();
    await done;
    const replies: any[] = [];
    let buffer = Buffer.concat(chunks);
    for (;;) {
      const frame = readFrame(buffer);
      if (!frame) break;
      replies.push(frame.message);
      buffer = frame.rest as Buffer;
    }
    expect(replies[0]).toMatchObject({ id: 1, ok: false, error: "nope" });
    expect(replies[1]).toMatchObject({
      id: 2,
      ok: true,
      result: { echoed: "ok" },
    });
  });
});

describe("pairing", () => {
  test("a valid code issues a token that then authenticates", async () => {
    const store = await testStore();
    const { code } = await createPairingCode(store);
    const issued = await redeemPairingCode(
      store,
      code,
      "abcdefghijklmnopabcdefghijklmnop",
    );
    const caller = await identify(store, "owner-token", "Bearer " + issued);
    expect(caller.role).toBe("extension");
    expect(() => requireOwner(caller)).toThrow(/requires the local CLI/);
    await store.db.close();
  });

  test("a wrong code is refused", async () => {
    const store = await testStore();
    await createPairingCode(store);
    await expect(redeemPairingCode(store, "WRONGCOD", "ext")).rejects.toThrow(
      /does not match/,
    );
    await store.db.close();
  });

  test("a code cannot be redeemed twice", async () => {
    const store = await testStore();
    const { code } = await createPairingCode(store);
    await redeemPairingCode(store, code, "ext-one");
    await expect(redeemPairingCode(store, code, "ext-two")).rejects.toThrow(
      /No pairing is in progress/,
    );
    await store.db.close();
  });

  test("an expired code is refused", async () => {
    const store = await testStore();
    const { code } = await createPairingCode(store, 10);
    const pending = await store.control<any>("pairing");
    await store.setControl("pairing", {
      ...pending,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(redeemPairingCode(store, code, "ext")).rejects.toThrow(
      /expired/,
    );
    await store.db.close();
  });

  test("an unknown bearer token is rejected", async () => {
    const store = await testStore();
    await expect(identify(store, "owner-token", "Bearer nope")).rejects.toThrow(
      /Unknown or revoked/,
    );
    await expect(identify(store, "owner-token", undefined)).rejects.toThrow(
      /Missing credential/,
    );
    await store.db.close();
  });

  test("the owner token authenticates as owner", async () => {
    const store = await testStore();
    const caller = await identify(store, "owner-token", "Bearer owner-token");
    expect(caller.role).toBe("owner");
    expect(() => requireOwner(caller)).not.toThrow();
    await store.db.close();
  });
});

describe("Claude Code adapter", () => {
  test("the project folder name matches Claude Code's own encoding", () => {
    // Verified against this machine's own ~/.claude/projects folder names.
    if (process.platform === "win32")
      expect(claudeCode.projectSlug("C:\\hack")).toBe("C--hack");
    // Every non-alphanumeric character becomes '-', including the dot in a version-like folder.
    expect(
      claudeCode.projectSlug(path.resolve("/srv/Website 2.0/app")),
    ).toMatch(/Website-2-0-app$/);
    expect(claudeCode.projectSlug(path.resolve("/srv/app"))).not.toContain("/");
  });

  test("reads user and assistant turns and skips meta, sidechain and tool traffic", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cc-"));
    const file = path.join(dir, "0bf83a4e-d3e9-4da6-ab8e-3bb1ba587d7a.jsonl");
    await writeFile(
      file,
      [
        JSON.stringify({ type: "mode", mode: "normal" }),
        JSON.stringify({
          type: "user",
          isMeta: true,
          message: { role: "user", content: "caveat text" },
          uuid: "m0",
        }),
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "fix the duplicate submit guard" },
          uuid: "m1",
          timestamp: "2026-09-12T10:00:00.000Z",
          cwd: "C:\\hack",
          gitBranch: "main",
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            model: "claude-opus-5",
            content: [
              { type: "text", text: "Setting the flag before the await." },
              { type: "tool_use", name: "Edit" },
            ],
          },
          uuid: "m2",
          timestamp: "2026-09-12T10:00:05.000Z",
        }),
        JSON.stringify({
          type: "assistant",
          isSidechain: true,
          message: {
            role: "assistant",
            content: [{ type: "text", text: "subagent noise" }],
          },
          uuid: "m3",
        }),
      ].join("\n"),
    );
    const result = await claudeCode.readTranscript(file);
    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.messages[0].text).toBe("fix the duplicate submit guard");
    expect(result.messages[1].text).toContain("[tool: Edit]");
    expect(result.messages.map((m) => m.text).join()).not.toContain(
      "subagent noise",
    );
    expect(result.cwd).toBe("C:\\hack");
    expect(result.messages[0].timestamp).toBe("2026-09-12T10:00:00.000Z");
    expect(result.messages[0].origin).toBe("claude-code");
  });

  test("hooks are installed idempotently and can be removed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cc-settings-"));
    const file = path.join(dir, "settings.json");
    await writeFile(
      file,
      JSON.stringify({ hooks: { Stop: [] }, model: "opus" }),
    );
    await claudeCode.installHooks("node shadowqa-individual-hook.mjs", file);
    await claudeCode.installHooks("node shadowqa-individual-hook.mjs", file);
    const settings = JSON.parse(
      await (await import("node:fs/promises")).readFile(file, "utf8"),
    );
    expect(settings.model).toBe("opus");
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
    const removed = await claudeCode.removeHooks(file);
    expect(removed.removed).toBe(3);
  });

  test("a missing transcript is reported, not thrown", async () => {
    const result = await claudeCode.readTranscript(
      path.join(tmpdir(), "does-not-exist.jsonl"),
    );
    expect(result.messages).toEqual([]);
  });
});

describe("Codex adapter", () => {
  test("reads assistant and user messages and drops preambles and reasoning", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "codex-"));
    await mkdir(path.join(dir, "2026", "09", "12"), { recursive: true });
    const file = path.join(
      dir,
      "2026",
      "09",
      "12",
      "rollout-2026-09-12T10-00-00-019e5492-7736-7671-bc5e-39651b209a04.jsonl",
    );
    await writeFile(
      file,
      [
        JSON.stringify({
          timestamp: "2026-09-12T10:00:00.000Z",
          type: "session_meta",
          payload: {
            session_id: "019e5492-7736-7671-bc5e-39651b209a04",
            cwd: "C:\\work",
            cli_version: "0.133.0",
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-09-12T10:00:01.000Z",
          ordinal: 1,
          payload: {
            type: "message",
            role: "developer",
            content: [{ type: "input_text", text: "<permissions>" }],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-09-12T10:00:02.000Z",
          ordinal: 2,
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "<environment_context>\n cwd \n</environment_context>",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-09-12T10:00:03.000Z",
          ordinal: 3,
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "add a retry cap" }],
          },
        }),
        JSON.stringify({
          type: "response_item",
          ordinal: 4,
          payload: {
            type: "reasoning",
            summary: [],
            encrypted_content: "opaque",
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-09-12T10:00:04.000Z",
          ordinal: 5,
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Capping at three." }],
          },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "token_count", info: {} },
        }),
      ].join("\n"),
    );
    const result = await codex.readRollout(file);
    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.messages[0].text).toBe("add a retry cap");
    expect(result.messages[1].text).toBe("Capping at three.");
    expect(result.cwd).toBe("C:\\work");
    expect(result.messages[0].conversationId).toBe(
      "019e5492-7736-7671-bc5e-39651b209a04",
    );
  });

  test("a session root that does not exist is reported honestly", async () => {
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = path.join(tmpdir(), "no-codex-here-" + Date.now());
    const status = await codex.detect();
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/No Codex session history/);
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  });
});

describe("pairing hardening", () => {
  test("five wrong codes cancel the pairing instead of allowing unlimited guesses", async () => {
    const store = await testStore();
    await createPairingCode(store);
    for (let attempt = 1; attempt <= 4; attempt++)
      await expect(
        redeemPairingCode(store, "GUESS" + attempt, "ext"),
      ).rejects.toThrow(/does not match/);
    await expect(redeemPairingCode(store, "GUESS5", "ext")).rejects.toThrow(
      /cancelled/,
    );
    // Even the correct code no longer works once the pairing was cancelled.
    await expect(redeemPairingCode(store, "WHATEVER", "ext")).rejects.toThrow(
      /No pairing is in progress/,
    );
    await store.db.close();
  });
});
