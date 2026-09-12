import { describe, expect, test } from "vitest";
import { batch, testProject, testStore } from "./individual-helpers.js";
import {
  collapse,
  isContinuation,
  messageKey,
  missingAfterFullSweep,
} from "../individual/core/dedupe.js";
import type { CapturedMessage } from "../individual/core/contracts.js";

const message = (overrides: Partial<CapturedMessage>): CapturedMessage => ({
  origin: "chatgpt",
  conversationId: "c1",
  role: "assistant",
  text: "hello",
  order: 1,
  url: "https://chatgpt.com/c/c1",
  capturedAt: new Date().toISOString(),
  complete: true,
  meta: {},
  ...overrides,
});

describe("capture identity", () => {
  test("a site message id is the identity, so an edit replaces rather than duplicates", () => {
    const first = message({ externalId: "m1", text: "original" });
    const edited = message({ externalId: "m1", text: "edited", order: 7 });
    expect(messageKey(first)).toBe(messageKey(edited));
  });

  test("without a site id, position inside the conversation is the identity", () => {
    expect(messageKey(message({ order: 3, role: "user" }))).toBe(
      "chatgpt:c1:pos:user:3",
    );
    expect(messageKey(message({ order: 4, role: "user" }))).not.toBe(
      messageKey(message({ order: 3, role: "user" })),
    );
  });

  test("collapse keeps the completed turn when a streaming frame arrives late", () => {
    const collapsed = collapse([
      message({ externalId: "m1", text: "done", complete: true }),
      message({ externalId: "m1", text: "do", complete: false }),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].message.text).toBe("done");
  });

  test("a growing assistant reply is recognised as the same turn, not a new one", () => {
    expect(
      isContinuation("Let me check", "Let me check the file and fix it"),
    ).toBe(true);
    expect(
      isContinuation("Let me check", "Something completely different entirely"),
    ).toBe(false);
  });

  test("an unseen message is not treated as deleted unless the sweep was complete", () => {
    expect(missingAfterFullSweep(["a", "b"], ["a"], false)).toEqual([]);
    expect(missingAfterFullSweep(["a", "b"], ["a"], true)).toEqual(["b"]);
  });
});

describe("capture storage", () => {
  test("re-sending the same turns stores nothing new", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    const payload = batch({}, [
      {
        role: "user",
        text: "we double-charge on double click",
        order: 1,
        externalId: "m1",
      },
      {
        role: "assistant",
        text: "set the guard before the await",
        order: 2,
        externalId: "m2",
      },
    ]);
    const first = await store.capture(payload);
    const second = await store.capture(payload);
    expect(first.stored).toBe(2);
    expect(second.stored).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.messageCount).toBe(2);
    await store.db.close();
  });

  test("a streamed reply is completed in place instead of duplicated", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    await store.capture(
      batch({}, [
        {
          role: "assistant",
          text: "Set the guard",
          order: 1,
          externalId: "m1",
          complete: false,
        },
      ]),
    );
    const finished = await store.capture(
      batch({}, [
        {
          role: "assistant",
          text: "Set the guard before the await, then release it in finally.",
          order: 1,
          externalId: "m1",
          complete: true,
        },
      ]),
    );
    expect(finished.messageCount).toBe(1);
    const context = await store.context("demo");
    expect(context[0].text).toContain("release it in finally");
    await store.db.close();
  });

  test("an incomplete frame never overwrites a finished turn", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    await store.capture(
      batch({}, [
        {
          role: "assistant",
          text: "Full answer here.",
          order: 1,
          externalId: "m1",
        },
      ]),
    );
    await store.capture(
      batch({}, [
        {
          role: "assistant",
          text: "Full",
          order: 1,
          externalId: "m1",
          complete: false,
        },
      ]),
    );
    const context = await store.context("demo");
    expect(context[0].text).toBe("Full answer here.");
    await store.db.close();
  });

  test("switching conversations keeps them separate", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    await store.capture(batch({}, [{ text: "first thread", order: 1 }]));
    await store.capture(
      batch(
        {
          conversation: {
            origin: "claude",
            conversationId: "conv-2",
            title: "Second",
            url: "https://claude.ai/chat/conv-2",
            coverage: "partial",
          },
        },
        [
          {
            origin: "claude",
            conversationId: "conv-2",
            text: "second thread",
            order: 1,
          },
        ],
      ),
    );
    const conversations = await store.conversations("demo");
    expect(conversations).toHaveLength(2);
    expect(await store.messageCount("demo", "chatgpt", "conv-1")).toBe(1);
    expect(await store.messageCount("demo", "claude", "conv-2")).toBe(1);
    await store.db.close();
  });

  test("partial capture is recorded as partial and never claimed as full history", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    const result = await store.capture(
      batch({}, [{ text: "only what was on screen", order: 5 }]),
    );
    const conversation = await store.conversation("chatgpt", "conv-1");
    expect(conversation?.coverage).toBe("partial");
    expect(result.messageCount).toBe(1);
    await store.db.close();
  });

  test("projects are isolated from one another", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    await store.putProject(testProject({ id: "other", name: "Other" }));
    await store.capture(batch({}, [{ text: "for demo", order: 1 }]));
    await store.capture(
      batch(
        {
          projectId: "other",
          conversation: {
            origin: "chatgpt",
            conversationId: "conv-9",
            title: "Other",
            url: "https://chatgpt.com/c/conv-9",
            coverage: "partial",
          },
        },
        [{ conversationId: "conv-9", text: "for other", order: 1 }],
      ),
    );
    expect((await store.context("demo")).map((m) => m.text)).toEqual([
      "for demo",
    ]);
    expect((await store.context("other")).map((m) => m.text)).toEqual([
      "for other",
    ]);
    await store.db.close();
  });

  test("a paused conversation stops accepting captures", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    await store.capture(batch({}, [{ text: "before pause", order: 1 }]));
    await store.pauseConversation("chatgpt:conv-1", true);
    const result = await store.capture(
      batch({}, [{ text: "after pause", order: 2 }]),
    );
    expect(result.paused).toBe(true);
    expect(result.stored).toBe(0);
    expect(await store.messageCount("demo", "chatgpt", "conv-1")).toBe(1);
    await store.db.close();
  });

  test("deleting a conversation removes its text and anything extracted from it", async () => {
    const store = await testStore();
    await store.putProject(testProject());
    await store.capture(batch({}, [{ text: "sensitive detail", order: 1 }]));
    const [stored] = await store.context("demo");
    await store.putItem({
      id: "item_1",
      projectId: "demo",
      kind: "requirement",
      text: "derived from that message",
      status: "proposed",
      sources: [stored.id],
      conflictsWith: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedByUser: false,
    });
    const result = await store.forgetConversation("chatgpt:conv-1");
    expect(result.removedMessages).toBe(1);
    expect(await store.context("demo")).toHaveLength(0);
    expect(await store.items("demo")).toHaveLength(0);
    await store.db.close();
  });
});
