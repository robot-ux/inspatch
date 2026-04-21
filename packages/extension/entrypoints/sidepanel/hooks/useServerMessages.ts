import { useEffect } from "react";
import type { Message } from "@inspatch/shared";
import { pendingKey } from "../config";
import type { TabSession, TabSessionStore } from "./useTabSessions";

/**
 * Routes an incoming WS message to the tab that originated its requestId.
 * Messages without a known owner are silently dropped — this happens when
 * the owning tab was closed or its session was already cleared.
 */
export function useServerMessages(
  lastMessage: Message | null,
  store: TabSessionStore,
) {
  // Destructure so the effect's dep array only changes when the underlying
  // callbacks change (they're all stable via useCallback in the store).
  const { patch, reset, release, ownerOf } = store;

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage;
    const requestId = "requestId" in msg ? (msg.requestId as string | undefined) : undefined;
    if (!requestId) return;
    const ownerTab = ownerOf(requestId);
    if (ownerTab === undefined) return;

    if (msg.type === "status_update") {
      patch(ownerTab, (s: TabSession) => {
        const next: Partial<TabSession> = { processing: msg };
        if (msg.status !== "complete" && msg.status !== "error") {
          next.statusLog = [...s.statusLog, msg.message];
        }
        if (msg.streamText) next.streamedText = s.streamedText + msg.streamText;
        return next;
      });
    } else if (msg.type === "change_result") {
      patch(ownerTab, {
        changeResult: msg,
        processing: null,
        pendingPlan: null,
        activeRequestId: null,
      });
      release(requestId);
      chrome.storage.local.remove(pendingKey(ownerTab));
    } else if (msg.type === "plan_proposal") {
      patch(ownerTab, {
        pendingPlan: msg.plan,
        processing: null,
        streamedText: "",
      });
    } else if (msg.type === "resume_not_found") {
      reset(ownerTab);
      release(requestId);
      chrome.storage.local.remove(pendingKey(ownerTab));
    }
  }, [lastMessage, patch, reset, release, ownerOf]);
}
