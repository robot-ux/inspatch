import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeMode,
  ChangeRequest,
  ConsoleError,
  ElementSelection,
  PageSource,
} from "@inspatch/shared";

import { SERVER_WS, newConversationId, openInEditor, pendingKey } from "./config";
import { useActiveTab } from "./hooks/useActiveTab";
import { useContentScript } from "./hooks/useContentScript";
import { useFirstRun } from "./hooks/useFirstRun";
import { useServerMessages } from "./hooks/useServerMessages";
import { useTabSessions } from "./hooks/useTabSessions";
import { useWebSocket } from "./hooks/useWebSocket";
import { NonLocalhostBlocked } from "./screens/NonLocalhostBlocked";
import { SidePanelMain } from "./screens/SidePanelMain";
import { resolveTargetedNode } from "./utils/tree";

export default function App() {
  const firstRun = useFirstRun();

  // Active-tab tracking. `onRead` fires on every tab read (including same-tab
  // URL updates); `onSwitch` fires only on real tab changes, so transient
  // errors from e.g. a failed Inspect stay visible within the same tab.
  const {
    activeTabId,
    activeTabIdRef,
    currentTabUrl,
    urlKind,
    fileUrlPermission,
    setFileUrlPermission,
  } = useActiveTab({
    onRead: (tab, kind) => {
      if ((kind === "localhost" || kind === "file") && tab.url) {
        firstRun.markOpenedWithSupported(tab.url);
      }
    },
    onSwitch: () => setTransientError(null),
  });

  // WS connect is placed after useActiveTab so we can pass the current tab URL
  // in — the hook re-sends `identify` whenever this changes, so the server's
  // logs follow real tab switches.
  const { status, lastMessage, send, reconnect } = useWebSocket(SERVER_WS, {
    tabUrl: currentTabUrl,
  });

  const sessions = useTabSessions(activeTabId);
  const { sendToContent, transientError, setTransientError } = useContentScript({
    onFilePermissionChange: setFileUrlPermission,
  });

  useServerMessages(lastMessage, sessions);

  const [extensionId, setExtensionId] = useState<string>("");
  useEffect(() => {
    setExtensionId(chrome.runtime?.id ?? "");
  }, []);

  // When WS (re)connects, try to resume any pending request for the active
  // tab. Destructured store callbacks are stable (useCallback w/ empty deps)
  // so the effect only refires on real changes. `lastResumedRef` guards
  // against redundant resume sends in the same connection cycle.
  const sessionsPatch = sessions.patch;
  const sessionsAssign = sessions.assign;
  const sessionsPatchEntry = sessions.patchEntry;
  const lastResumedRef = useRef<{ tabId: number; requestId: string } | null>(null);
  useEffect(() => {
    if (status !== "connected") {
      lastResumedRef.current = null;
      return;
    }
    if (activeTabId === null) return;
    const tabId = activeTabId;
    const key = pendingKey(tabId);
    chrome.storage.local.get(key).then((data) => {
      const pending = data[key] as { requestId: string; element: ElementSelection } | undefined;
      if (!pending) return;
      const already = lastResumedRef.current;
      if (already && already.tabId === tabId && already.requestId === pending.requestId) return;
      lastResumedRef.current = { tabId, requestId: pending.requestId };
      sessionsPatch(tabId, {
        selectedElement: pending.element,
        targetedXpath: pending.element.xpath,
        hasUsedInspect: true,
        inspectState: "idle",
        activeRequestId: pending.requestId,
      });
      // If the pending entry is still in history, show a short reconnecting
      // pill on it. If history was lost (sidepanel closed + reopened), the
      // server's buffered reply will have no entry to land on — the user
      // will simply see an empty chat and can retry.
      sessionsPatchEntry(tabId, pending.requestId, {
        processing: {
          type: "status_update",
          requestId: pending.requestId,
          status: "analyzing",
          message: "Reconnecting…",
        },
      });
      sessionsAssign(pending.requestId, tabId);
      send({ type: "resume", requestId: pending.requestId });
    });
  }, [status, activeTabId, send, sessionsPatch, sessionsAssign, sessionsPatchEntry]);

  // Content-script events + tab lifecycle (reload / close).
  useEffect(() => {
    const onRuntimeMessage = (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (!message || typeof message !== "object" || !("type" in message)) return;
      const msg = message as { type: string };
      const msgTabId = sender.tab?.id ?? activeTabIdRef.current;
      if (msgTabId == null) return;

      if (msg.type === "element_selection") {
        const next = message as ElementSelection;
        sessions.patch(msgTabId, {
          selectedElement: next,
          targetedXpath: next.xpath,
          inspectState: "idle",
        });
      } else if (msg.type === "inspect-stopped") {
        sessions.patch(msgTabId, { inspectState: "idle" });
      } else if (msg.type === "console_error") {
        const err = message as ConsoleError & { type: string };
        sessions.patch(msgTabId, (s) => ({
          consoleErrors: [
            ...s.consoleErrors.slice(-19),
            { message: err.message, stack: err.stack, timestamp: err.timestamp },
          ],
        }));
      }
    };
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    // A tab reload invalidates the page context — any stale selection is
    // meaningless. Drop the session for that tab entirely.
    const onTabReload = (tabId: number, changeInfo: { status?: string }) => {
      if (changeInfo.status !== "loading") return;
      const curr = sessions.get(tabId);
      if (!curr) return;
      if (curr.activeRequestId) sessions.release(curr.activeRequestId);
      sessions.reset(tabId);
    };
    chrome.tabs.onUpdated.addListener(onTabReload);

    // A closed tab has no home any more — drop the session and any pending
    // request registration so nothing leaks behind a dangling tab id.
    const onTabRemoved = (tabId: number) => {
      const curr = sessions.get(tabId);
      if (curr?.activeRequestId) sessions.release(curr.activeRequestId);
      sessions.remove(tabId);
      chrome.storage.local.remove(pendingKey(tabId));
    };
    chrome.tabs.onRemoved.addListener(onTabRemoved);

    return () => {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      chrome.tabs.onUpdated.removeListener(onTabReload);
      chrome.tabs.onRemoved.removeListener(onTabRemoved);
    };
  }, [sessions, activeTabIdRef]);

  // Handlers — all read the active tab via ref so stale closures can't
  // accidentally target a tab the user has since switched away from.
  const handleStartInspect = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    if (tabId === null) return;
    try {
      await sendToContent({ type: "start-inspect" });
      sessions.patch(tabId, { inspectState: "inspecting", hasUsedInspect: true });
    } catch {
      // transientError already set by sendToContent
    }
  }, [sendToContent, sessions, activeTabIdRef]);

  const handleStopInspect = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    if (tabId === null) return;
    try {
      await sendToContent({ type: "stop-inspect" });
    } catch {
      // ignore
    }
    sessions.patch(tabId, { inspectState: "idle" });
  }, [sendToContent, sessions, activeTabIdRef]);

  const handleClear = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    if (tabId === null) return;
    const curr = sessions.get(tabId);
    if (curr?.inspectState === "inspecting") {
      try {
        await sendToContent({ type: "stop-inspect" });
      } catch {
        // ignore
      }
    }
    if (curr?.activeRequestId) sessions.release(curr.activeRequestId);
    sessions.reset(tabId);
    chrome.storage.local.remove(pendingKey(tabId));
  }, [sendToContent, sessions, activeTabIdRef]);

  const handleElementHover = useCallback(
    () => sendToContent({ type: "highlight-element" }).catch(() => {}),
    [sendToContent],
  );
  const handleElementLeave = useCallback(
    () => sendToContent({ type: "clear-highlight" }).catch(() => {}),
    [sendToContent],
  );
  const handleRetargetHover = useCallback(
    (xpath: string) => sendToContent({ type: "highlight-by-xpath", xpath }).catch(() => {}),
    [sendToContent],
  );
  const handleRetargetLeave = handleElementLeave;

  const handleTargetRow = useCallback(
    (xpath: string) => {
      const tabId = activeTabIdRef.current;
      if (tabId === null) return;
      // Retargeting inside the existing snapshot tree is purely local: only
      // move the target pointer. The chat history stays intact — users may
      // ask a follow-up question about the new target in the same session.
      sessions.patch(tabId, { targetedXpath: xpath });
    },
    [sessions, activeTabIdRef],
  );

  const handleSendChange = useCallback(
    (description: string, imageDataUrl?: string, mode: ChangeMode = "quick") => {
      const tabId = activeTabIdRef.current;
      if (tabId === null) return;
      const curr = sessions.get(tabId);
      if (!curr?.selectedElement) return;
      const { selectedElement, targetedXpath, consoleErrors } = curr;
      const target = resolveTargetedNode(selectedElement, targetedXpath);
      const isAnchor = target.xpath === selectedElement.xpath;
      const requestId = crypto.randomUUID();
      // Reuse the tab's existing conversation or start a fresh one. The
      // server uses this id to route turns into a long-lived Claude session
      // so follow-ups keep full context.
      const conversationId = curr.conversationId ?? newConversationId();

      sessions.startTurn(tabId, {
        conversationId,
        entry: {
          requestId,
          userText: description,
          screenshotDataUrl: imageDataUrl,
          target: {
            componentName: target.componentName,
            sourceFile: target.sourceFile,
            sourceLine: target.sourceLine,
            xpath: target.xpath,
          },
          // Optimistic loading state so the InFlightCard renders immediately
          // instead of waiting on the server's first status_update. The real
          // update from the server will overwrite this within a few hundred ms.
          processing: {
            type: "status_update",
            requestId,
            status: "analyzing",
            message: "Sending to Claude…",
          },
          changeResult: null,
          pendingPlan: null,
          streamedText: "",
          statusLog: [],
          createdAt: Date.now(),
        },
      });
      sessions.assign(requestId, tabId);

      const pageSource: PageSource = selectedElement.pageSource ?? "localhost";
      const changeRequest: ChangeRequest = {
        type: "change_request",
        requestId,
        conversationId,
        description,
        // Target fields point to the actively selected row in the tree.
        // boundingRect / computedStyles / sourceColumn only exist on the
        // anchor (ElementSelection), so drop them when the user retargeted
        // to a different row — Claude has componentName + sourceFile + xpath
        // to locate the edit site precisely.
        elementXpath: target.xpath,
        componentName: target.componentName,
        ancestors: selectedElement.ancestors,
        sourceFile: target.sourceFile,
        sourceLine: target.sourceLine,
        sourceColumn: isAnchor ? selectedElement.sourceColumn : undefined,
        screenshotDataUrl: imageDataUrl,
        boundingRect: isAnchor ? selectedElement.boundingRect : undefined,
        computedStyles: isAnchor ? selectedElement.computedStyles : undefined,
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
        pageSource,
        filePath: selectedElement.filePath,
        mode,
      };
      send(changeRequest);
      chrome.storage.local.set({
        [pendingKey(tabId)]: { requestId, element: selectedElement },
      });
    },
    [send, sessions, activeTabIdRef],
  );

  const handleNewConversation = useCallback(() => {
    const tabId = activeTabIdRef.current;
    if (tabId === null) return;
    const curr = sessions.get(tabId);
    if (curr?.activeRequestId) sessions.release(curr.activeRequestId);
    sessions.patch(tabId, {
      activeRequestId: null,
      conversationId: null,
      history: [],
    });
    chrome.storage.local.remove(pendingKey(tabId));
  }, [sessions, activeTabIdRef]);

  const handleApprovePlan = useCallback(() => {
    const tabId = activeTabIdRef.current;
    if (tabId === null) return;
    const requestId = sessions.get(tabId)?.activeRequestId;
    if (!requestId) return;
    sessions.patchEntry(tabId, requestId, {
      pendingPlan: null,
      statusLog: [],
      streamedText: "",
      processing: {
        type: "status_update",
        requestId,
        status: "applying",
        message: "Executing approved plan…",
      },
    });
    send({ type: "plan_approval", requestId, approve: true });
  }, [send, sessions, activeTabIdRef]);

  const handleCancelPlan = useCallback(() => {
    const tabId = activeTabIdRef.current;
    if (tabId === null) return;
    const requestId = sessions.get(tabId)?.activeRequestId;
    if (requestId) {
      send({ type: "plan_approval", requestId, approve: false });
      sessions.patchEntry(tabId, requestId, {
        pendingPlan: null,
        processing: null,
        statusLog: [],
        streamedText: "",
      });
      sessions.release(requestId);
    }
    sessions.patch(tabId, { activeRequestId: null });
    chrome.storage.local.remove(pendingKey(tabId));
  }, [send, sessions, activeTabIdRef]);

  if (urlKind === "other") {
    const firstTime =
      firstRun.ready && !firstRun.hasOpenedBefore && !firstRun.lastSupportedUrl;
    return (
      <NonLocalhostBlocked
        currentUrl={currentTabUrl}
        lastSupportedUrl={firstRun.lastSupportedUrl}
        firstTime={firstTime}
      />
    );
  }

  const current = sessions.current;
  return (
    <SidePanelMain
      connectionStatus={status}
      onReconnect={reconnect}
      inspectState={current.inspectState}
      hasUsedInspect={current.hasUsedInspect}
      selectedElement={current.selectedElement}
      targetedXpath={current.targetedXpath}
      history={current.history}
      activeRequestId={current.activeRequestId}
      consoleErrors={current.consoleErrors}
      transientError={transientError}
      showFileUrlBanner={urlKind === "file" && !fileUrlPermission}
      extensionId={extensionId}
      currentTabUrl={currentTabUrl}
      onStartInspect={handleStartInspect}
      onStopInspect={handleStopInspect}
      onClear={handleClear}
      onElementHover={handleElementHover}
      onElementLeave={handleElementLeave}
      onRetargetHover={handleRetargetHover}
      onRetargetLeave={handleRetargetLeave}
      onTargetRow={handleTargetRow}
      onSendChange={handleSendChange}
      onApprovePlan={handleApprovePlan}
      onCancelPlan={handleCancelPlan}
      onNewConversation={handleNewConversation}
      onOpenSource={openInEditor}
    />
  );
}
