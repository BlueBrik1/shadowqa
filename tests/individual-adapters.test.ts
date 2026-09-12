import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseHTML } from "linkedom";
import { chatgpt } from "../individual/extension/src/content/adapters/chatgpt.js";
import { claude } from "../individual/extension/src/content/adapters/claude.js";

const fixture = (name: string) =>
  readFile(path.resolve("individual/extension/fixtures", name), "utf8");

const dom = (html: string) => parseHTML(html).document as unknown as Document;

describe("ChatGPT adapter", () => {
  test("reads a conversation id only from a conversation URL", () => {
    expect(
      chatgpt.conversationId(
        "https://chatgpt.com/c/6b1f2c34-aaaa-bbbb-cccc-1234567890ab",
      ),
    ).toBe("6b1f2c34-aaaa-bbbb-cccc-1234567890ab");
    expect(
      chatgpt.conversationId("https://chatgpt.com/g/g-abc/c/1234abcd-ef00"),
    ).toBe("1234abcd-ef00");
    expect(chatgpt.conversationId("https://chatgpt.com/")).toBeUndefined();
    expect(
      chatgpt.conversationId("https://claude.ai/chat/abcd1234"),
    ).toBeUndefined();
  });

  test("captures both roles in order, with the site's own ids", async () => {
    const result = chatgpt.read(dom(await fixture("chatgpt-thread.html")));
    expect(result.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(result.messages.map((m) => m.externalId)).toEqual([
      "aaa-111",
      "bbb-222",
      "ccc-333",
      "ddd-444",
    ]);
    expect(result.messages[0].text).toContain("double-charge");
    expect(result.messages[1].text).toContain("pending = true;");
  });

  test("button labels and screen-reader text never become message content", async () => {
    const result = chatgpt.read(dom(await fixture("chatgpt-thread.html")));
    const joined = result.messages.map((m) => m.text).join("\n");
    expect(joined).not.toContain("Edit message");
    expect(joined).not.toContain("Copy");
    expect(joined).not.toContain("Copied");
  });

  test("only the final assistant turn is marked incomplete while streaming", async () => {
    const result = chatgpt.read(dom(await fixture("chatgpt-thread.html")));
    expect(result.streaming).toBe(true);
    expect(result.messages.map((m) => m.complete)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  test("a page it does not recognise reports a warning instead of an empty thread", () => {
    const result = chatgpt.read(
      dom("<html><body><div>Loading…</div></body></html>"),
    );
    expect(result.messages).toHaveLength(0);
    expect(result.warning).toMatch(/markup changed|still be loading/i);
  });

  test("it never claims to have seen the whole thread", async () => {
    const result = chatgpt.read(dom(await fixture("chatgpt-thread.html")));
    expect(result.sawWholeThread).toBe(false);
  });
});

describe("Claude adapter", () => {
  test("reads a conversation id only from a chat URL", () => {
    expect(
      claude.conversationId(
        "https://claude.ai/chat/9f2c41ab-7d63-4e05-18c2-b4a9f1d77ee3",
      ),
    ).toBe("9f2c41ab-7d63-4e05-18c2-b4a9f1d77ee3");
    expect(claude.conversationId("https://claude.ai/new")).toBeUndefined();
    expect(
      claude.conversationId("https://chatgpt.com/c/abcd1234"),
    ).toBeUndefined();
  });

  test("orders turns by document position, not by assuming they alternate", async () => {
    const result = claude.read(dom(await fixture("claude-thread.html")));
    expect(result.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "user",
      "assistant",
    ]);
    expect(result.messages[2].text).toContain("do not change the tests");
    expect(result.messages[3].text).toContain("keep the finally block");
  });

  test("captures the site's message ids and strips controls", async () => {
    const result = claude.read(dom(await fixture("claude-thread.html")));
    expect(result.messages[0].externalId).toBe("u-1");
    expect(result.messages.map((m) => m.text).join("\n")).not.toContain("Copy");
  });

  test("marks the streaming reply incomplete", async () => {
    const result = claude.read(dom(await fixture("claude-thread.html")));
    expect(result.streaming).toBe(true);
    expect(result.messages.at(-1)?.complete).toBe(false);
    expect(result.messages.slice(0, -1).every((m) => m.complete)).toBe(true);
  });

  test("an unrecognised page warns rather than reporting nothing", () => {
    const result = claude.read(dom("<html><body><main></main></body></html>"));
    expect(result.messages).toHaveLength(0);
    expect(result.warning).toBeTruthy();
  });

  test("title falls back to the document title without the site suffix", async () => {
    const document = dom(await fixture("claude-thread.html"));
    expect(claude.title(document)).toBe("Retry banner");
  });
});
