import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeResult,
  ConsoleError,
  ElementSelection,
  StatusUpdate,
} from "@inspatch/shared";

export type InspectState = "idle" | "inspecting";

/**
 * Snapshot of the element as it was at the moment the user hit send. Used
 * to render a compact header on the history entry without depending on the
 * current selection (which may have moved on).
 */
export interface ConversationEntryTarget {
  componentName?: string;
  sourceFile?: string;
  sourceLine?: number;
  xpath: string;
}

/**
 * One user turn + Claude's response in the chat transcript. Each entry
 * owns its own status stream, so earlier turns keep their final state
 * while the latest turn can still be receiving updates.
 */
export interface ConversationEntry {
  requestId: string;
  userText: string;
  screenshotDataUrl?: string;
  target: ConversationEntryTarget;
  processing: StatusUpdate | null;
  changeResult: ChangeResult | null;
  pendingPlan: string | null;
  streamedText: string;
  statusLog: string[];
  createdAt: number;
}

/**
 * Per-tab inspect state. Each browser tab the sidepanel has touched keeps
 * its own copy in the `sessions` record, keyed by tabId. Switching tabs
 * just swaps which session the UI renders; background tabs keep their
 * state and can still receive server updates via requestId routing.
 */
export interface TabSession {
  selectedElement: ElementSelection | null;
  targetedXpath: string | null;
  consoleErrors: ConsoleError[];
  hasUsedInspect: boolean;
  inspectState: InspectState;
  /** Currently in-flight requestId (latest entry that hasn't finished). */
  activeRequestId: string | null;
  /**
   * Conversation key shared with the server. Lazily minted on the first
   * change_request; reset on page reload / URL change (via `reset(tabId)`)
   * and on the explicit "New conversation" action.
   */
  conversationId: string | null;
  /** Chat transcript for the current conversation. */
  history: ConversationEntry[];
}

export const EMPTY_SESSION: TabSession = {
  selectedElement: null,
  targetedXpath: null,
  consoleErrors: [],
  hasUsedInspect: false,
  inspectState: "idle",
  activeRequestId: null,
  conversationId: null,
  history: [],
};

export type SessionPatch =
  | Partial<TabSession>
  | ((s: TabSession) => Partial<TabSession>);

export type EntryPatch =
  | Partial<ConversationEntry>
  | ((e: ConversationEntry) => Partial<ConversationEntry>);

export interface TabSessionStore {
  /** Session for the currently active tab (or EMPTY_SESSION if none). */
  current: TabSession;
  /** Synchronous snapshot of any tab's session — use from event handlers. */
  get: (tabId: number) => TabSession | undefined;
  patch: (tabId: number, patch: SessionPatch) => void;
  reset: (tabId: number) => void;
  remove: (tabId: number) => void;
  /**
   * Start a new turn atomically: sets activeRequestId + conversationId,
   * clears consoleErrors, and appends the chat entry in one setState.
   */
  startTurn: (
    tabId: number,
    args: { conversationId: string; entry: ConversationEntry },
  ) => void;
  /** Merge a patch into the entry identified by requestId. */
  patchEntry: (tabId: number, requestId: string, patch: EntryPatch) => void;
  /** Register a requestId as owned by a tab, so WS replies route correctly. */
  assign: (requestId: string, tabId: number) => void;
  release: (requestId: string) => void;
  ownerOf: (requestId: string) => number | undefined;
}

/**
 * Session store for all tabs the sidepanel has touched. `activeTabId` selects
 * which session `current` exposes to the UI; mutators target a specific tab
 * so updates can land on background tabs too.
 */
export function useTabSessions(activeTabId: number | null): TabSessionStore {
  const [sessions, setSessions] = useState<Record<number, TabSession>>({});

  // Mirror state into refs so callbacks/listeners can read the latest values
  // synchronously without needing the state in their dependency arrays.
  const sessionsRef = useRef<Record<number, TabSession>>({});
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Maps each in-flight requestId to the tab that owns it, so incoming WS
  // messages still reach the right tab's session when the user has switched
  // away. Lives in a ref because it's pure routing metadata — never rendered.
  const requestToTab = useRef<Map<string, number>>(new Map());

  const patch = useCallback((tabId: number, p: SessionPatch) => {
    setSessions((prev) => {
      const curr = prev[tabId] ?? EMPTY_SESSION;
      const delta = typeof p === "function" ? p(curr) : p;
      return { ...prev, [tabId]: { ...curr, ...delta } };
    });
  }, []);

  const reset = useCallback((tabId: number) => {
    setSessions((prev) => ({ ...prev, [tabId]: EMPTY_SESSION }));
  }, []);

  const remove = useCallback((tabId: number) => {
    setSessions((prev) => {
      if (!(tabId in prev)) return prev;
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
  }, []);

  const startTurn = useCallback(
    (
      tabId: number,
      { conversationId, entry }: { conversationId: string; entry: ConversationEntry },
    ) => {
      setSessions((prev) => {
        const curr = prev[tabId] ?? EMPTY_SESSION;
        return {
          ...prev,
          [tabId]: {
            ...curr,
            activeRequestId: entry.requestId,
            conversationId,
            consoleErrors: [],
            history: [...curr.history, entry],
          },
        };
      });
    },
    [],
  );

  const patchEntry = useCallback(
    (tabId: number, requestId: string, p: EntryPatch) => {
      setSessions((prev) => {
        const curr = prev[tabId];
        if (!curr) return prev;
        const idx = curr.history.findIndex((e) => e.requestId === requestId);
        if (idx === -1) return prev;
        const entry = curr.history[idx];
        const delta = typeof p === "function" ? p(entry) : p;
        const nextHistory = curr.history.slice();
        nextHistory[idx] = { ...entry, ...delta };
        return { ...prev, [tabId]: { ...curr, history: nextHistory } };
      });
    },
    [],
  );

  const get = useCallback(
    (tabId: number) => sessionsRef.current[tabId],
    [],
  );

  const assign = useCallback((requestId: string, tabId: number) => {
    requestToTab.current.set(requestId, tabId);
  }, []);

  const release = useCallback((requestId: string) => {
    requestToTab.current.delete(requestId);
  }, []);

  const ownerOf = useCallback(
    (requestId: string) => requestToTab.current.get(requestId),
    [],
  );

  const current: TabSession =
    activeTabId !== null ? sessions[activeTabId] ?? EMPTY_SESSION : EMPTY_SESSION;

  return {
    current,
    get,
    patch,
    reset,
    remove,
    startTurn,
    patchEntry,
    assign,
    release,
    ownerOf,
  };
}
