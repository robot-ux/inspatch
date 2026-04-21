import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeResult,
  ConsoleError,
  ElementSelection,
  StatusUpdate,
} from "@inspatch/shared";

export type InspectState = "idle" | "inspecting";

/**
 * Per-tab inspect state. Each browser tab the sidepanel has touched keeps
 * its own copy in the `sessions` record, keyed by tabId. Switching tabs
 * just swaps which session the UI renders; background tabs keep their
 * state and can still receive server updates via requestId routing.
 */
export interface TabSession {
  selectedElement: ElementSelection | null;
  targetedXpath: string | null;
  processing: StatusUpdate | null;
  changeResult: ChangeResult | null;
  pendingPlan: string | null;
  streamedText: string;
  statusLog: string[];
  consoleErrors: ConsoleError[];
  hasUsedInspect: boolean;
  inspectState: InspectState;
  activeRequestId: string | null;
}

export const EMPTY_SESSION: TabSession = {
  selectedElement: null,
  targetedXpath: null,
  processing: null,
  changeResult: null,
  pendingPlan: null,
  streamedText: "",
  statusLog: [],
  consoleErrors: [],
  hasUsedInspect: false,
  inspectState: "idle",
  activeRequestId: null,
};

export type SessionPatch =
  | Partial<TabSession>
  | ((s: TabSession) => Partial<TabSession>);

export interface TabSessionStore {
  /** Session for the currently active tab (or EMPTY_SESSION if none). */
  current: TabSession;
  /** Synchronous snapshot of any tab's session — use from event handlers. */
  get: (tabId: number) => TabSession | undefined;
  patch: (tabId: number, patch: SessionPatch) => void;
  reset: (tabId: number) => void;
  remove: (tabId: number) => void;
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

  return { current, get, patch, reset, remove, assign, release, ownerOf };
}
