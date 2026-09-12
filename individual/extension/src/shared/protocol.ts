export const NATIVE_HOST = "com.shadowqa.individual";

export type Origin = "chatgpt" | "claude";

export type PageState = {
  origin: Origin | null;
  conversationId: string | null;
  url: string;
  title: string;
  messageCount: number;
  streaming: boolean;
  sawWholeThread: boolean;
  warning?: string;
};

/** content script → background */
export type ContentMessage =
  | { type: "page"; state: PageState }
  | {
      type: "capture";
      state: PageState;
      messages: {
        externalId?: string;
        role: "user" | "assistant";
        text: string;
        order: number;
        complete: boolean;
        timestamp?: string;
      }[];
    };

/** side panel → background */
export type PanelMessage =
  | { type: "state" }
  | { type: "pair"; code: string }
  | { type: "unpair" }
  | { type: "track"; projectId: string }
  | { type: "untrack" }
  | { type: "pause"; paused: boolean }
  | { type: "forget" }
  | { type: "refresh" }
  | {
      type: "detail";
      view: "items" | "plans" | "tasks" | "findings";
      projectId: string;
    };

export type Tracking = {
  /** conversation key (`origin:conversationId`) → project it belongs to */
  conversations: Record<
    string,
    { projectId: string; paused: boolean; title: string; origin: Origin }
  >;
};

export type PanelState = {
  companion: {
    reachable: boolean;
    paired: boolean;
    error?: string;
    url?: string;
  };
  page: PageState | null;
  tracked: { projectId: string; paused: boolean } | null;
  projects: { id: string; name: string; mode: string; backend: string }[];
  conversations: {
    id: string;
    origin: string;
    title: string;
    messageCount: number;
    coverage: string;
    tracked: boolean;
    paused: boolean;
    lastSync: string;
    lastError: string | null;
    projectId: string;
  }[];
  lastSync: string | null;
  lastError: string | null;
};

export const conversationKey = (origin: string, id: string) =>
  `${origin}:${id}`;
