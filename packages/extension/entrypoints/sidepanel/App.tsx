import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeMode,
  ChangeRequest,
  ChangeResult,
  ConsoleError,
  ElementSelection,
  PageSource,
  StatusUpdate,
} from "@inspatch/shared";

import { useFirstRun } from "./hooks/useFirstRun";
import { useWebSocket } from "./hooks/useWebSocket";
import { NonLocalhostBlocked } from "./screens/NonLocalhostBlocked";
import { SidePanelMain } from "./screens/SidePanelMain";

const SERVER_WS = "ws://localhost:9377";
const SERVER_HTTP = "http://localhost:9377";
const pendingKey = (tabId: number) => `pending_${tabId}`;

type InspectState = "idle" | "inspecting";
type UrlKind = "localhost" | "file" | "other";

function classifyUrl(url: string | undefined): UrlKind {
  if (!url) return "other";
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return "file";
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]") {
      return "localhost";
    }
    return "other";
  } catch {
    return "other";
  }
}

async function checkFileUrlPermission(): Promise<boolean> {
  // chrome.extension.isAllowedFileSchemeAccess is still supported in MV3 and
  // is the only reliable way to detect whether the user has toggled
  // "Allow access to file URLs" for this extension.
  const api = (chrome as unknown as {
    extension?: { isAllowedFileSchemeAccess?: () => Promise<boolean> };
  }).extension;
  if (!api?.isAllowedFileSchemeAccess) return true;
  try {
    return await api.isAllowedFileSchemeAccess();
  } catch {
    return true;
  }
}

function openInEditor(file: string, line?: number, column?: number) {
  const params = new URLSearchParams({ file });
  if (line) params.set("line", String(line));
  if (column) params.set("column", String(column));
  fetch(`${SERVER_HTTP}/open-in-editor?${params}`).catch(() => {});
}

export default function App() {
  const { status, lastMessage, send, reconnect } = useWebSocket(SERVER_WS);
  const firstRun = useFirstRun();

  const [inspectState, setInspectState] = useState<InspectState>("idle");
  const [selectedElement, setSelectedElement] = useState<ElementSelection | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<StatusUpdate | null>(null);
  const [changeResult, setChangeResult] = useState<ChangeResult | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [consoleErrors, setConsoleErrors] = useState<ConsoleError[]>([]);
  const [urlKind, setUrlKind] = useState<UrlKind>("localhost");
  const [currentTabUrl, setCurrentTabUrl] = useState<string | undefined>(undefined);
  const [hasUsedInspect, setHasUsedInspect] = useState(false);
  const [fileUrlPermission, setFileUrlPermission] = useState(true);
  const [extensionId, setExtensionId] = useState<string>("");

  const activeRequestId = useRef<string | null>(null);
  const activeTabId = useRef<number | null>(null);
  const inspectTabId = useRef<number | null>(null);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "status_update") {
      const su = lastMessage;
      if (activeRequestId.current && su.requestId && su.requestId !== activeRequestId.current) return;
      setProcessing(su);
      if (su.status !== "complete" && su.status !== "error") {
        setStatusLog((prev) => [...prev, su.message]);
      }
      if (su.streamText) setStreamedText((prev) => prev + su.streamText);
    } else if (lastMessage.type === "change_result") {
      const cr = lastMessage;
      if (activeRequestId.current && cr.requestId && cr.requestId !== activeRequestId.current) return;
      setChangeResult(cr);
      setProcessing(null);
      setPendingPlan(null);
      activeRequestId.current = null;
      if (activeTabId.current) chrome.storage.local.remove(pendingKey(activeTabId.current));
    } else if (lastMessage.type === "plan_proposal") {
      const pp = lastMessage;
      if (activeRequestId.current && pp.requestId !== activeRequestId.current) return;
      // Plan-only outcome: show the plan card, keep processing paused, keep the
      // requestId active so plan_approval lands on the same request.
      setPendingPlan(pp.plan);
      setProcessing(null);
      setStreamedText("");
    } else if (lastMessage.type === "resume_not_found") {
      if (activeTabId.current) chrome.storage.local.remove(pendingKey(activeTabId.current));
      setProcessing(null);
      setPendingPlan(null);
      setSelectedElement(null);
      setHasUsedInspect(false);
      activeRequestId.current = null;
    }
  }, [lastMessage]);

  const sendToContentScript = useCallback(async (message: { type: string } & Record<string, unknown>) => {
    setTransientError(null);
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      setTransientError("No active tab found");
      return;
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Content script missing has two distinct causes on file:// pages:
      //   1. "Allow access to file URLs" is still off → the banner is showing.
      //   2. Permission is on, but the tab was loaded before Inspatch was last
      //      reloaded or before the permission was flipped on → reload the tab.
      // Re-checking permission here (instead of trusting state) makes the hint
      // accurate even if the user just toggled the switch.
      const kind = classifyUrl(tab.url);
      if (kind === "file") {
        const allowed = await checkFileUrlPermission();
        setFileUrlPermission(allowed);
        setTransientError(
          allowed
            ? "Can't reach the page. Reload this tab — Inspatch was reloaded after the tab opened."
            : "Can't reach the page. Enable \"Allow access to file URLs\" (see banner), then reload this tab.",
        );
      } else {
        setTransientError(
          "Content script not loaded — reload this tab (Inspatch was likely reloaded after the tab opened).",
        );
      }
      throw new Error("Content script not available");
    }
  }, []);

  useEffect(() => {
    setExtensionId(chrome.runtime?.id ?? "");
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    const tabId = activeTabId.current;
    if (!tabId) return;
    const key = pendingKey(tabId);
    chrome.storage.local.get(key).then((data) => {
      const pending = data[key] as { requestId: string; element: ElementSelection } | undefined;
      if (!pending) return;
      setSelectedElement(pending.element);
      setHasUsedInspect(true);
      setInspectState("idle");
      activeRequestId.current = pending.requestId;
      inspectTabId.current = tabId;
      setProcessing({
        type: "status_update",
        requestId: pending.requestId,
        status: "analyzing",
        message: "Reconnecting…",
      });
      send({ type: "resume", requestId: pending.requestId });
    });
  }, [status, send]);

  useEffect(() => {
    const checkTab = async (tabId?: number) => {
      let tab: chrome.tabs.Tab | undefined;
      if (tabId !== undefined) {
        try {
          tab = await chrome.tabs.get(tabId);
        } catch {
          return;
        }
      } else {
        const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = t;
      }
      if (tab?.id) activeTabId.current = tab.id;
      setCurrentTabUrl(tab?.url);

      const kind = classifyUrl(tab?.url);
      setUrlKind(kind);
      if (kind === "localhost" && tab?.url) {
        firstRun.markOpenedWithLocalhost(tab.url);
      }
      // file:// pages require the "Allow access to file URLs" toggle.
      // Re-check every tab switch so the banner clears the moment the user flips it on.
      if (kind === "file") {
        setFileUrlPermission(await checkFileUrlPermission());
      } else {
        setFileUrlPermission(true);
      }
    };
    checkTab();

    const onActivated = ({ tabId }: { tabId: number }) => {
      activeTabId.current = tabId;
      checkTab(tabId);
    };
    const onUpdated = (tabId: number, info: { url?: string; status?: string }) => {
      if (tabId !== activeTabId.current) return;
      if (info.url !== undefined || info.status === "complete") checkTab(tabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [firstRun]);

  useEffect(() => {
    const onRuntimeMessage = (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) return;
      const msg = message as { type: string };
      if (msg.type === "element_selection") {
        setSelectedElement(message as ElementSelection);
        setInspectState("idle");
        inspectTabId.current = activeTabId.current;
      } else if (msg.type === "inspect-stopped") {
        setInspectState("idle");
      } else if (msg.type === "console_error") {
        const err = message as ConsoleError & { type: string };
        setConsoleErrors((prev) => [
          ...prev.slice(-19),
          { message: err.message, stack: err.stack, timestamp: err.timestamp },
        ]);
      }
    };
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    const onTabReload = (tabId: number, changeInfo: { status?: string }) => {
      if (changeInfo.status !== "loading" || tabId !== inspectTabId.current) return;
      inspectTabId.current = null;
      setSelectedElement(null);
      setInspectState("idle");
      setTransientError(null);
      setProcessing(null);
      setChangeResult(null);
      setPendingPlan(null);
      setStreamedText("");
      setConsoleErrors([]);
      setStatusLog([]);
      setHasUsedInspect(false);
      activeRequestId.current = null;
    };
    chrome.tabs.onUpdated.addListener(onTabReload);

    return () => {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      chrome.tabs.onUpdated.removeListener(onTabReload);
    };
  }, []);

  const handleStartInspect = useCallback(async () => {
    try {
      await sendToContentScript({ type: "start-inspect" });
      setInspectState("inspecting");
      setHasUsedInspect(true);
      inspectTabId.current = activeTabId.current;
    } catch {
      // transientError already set
    }
  }, [sendToContentScript]);

  const handleStopInspect = useCallback(async () => {
    try {
      await sendToContentScript({ type: "stop-inspect" });
    } catch {
      // ignore
    }
    setInspectState("idle");
  }, [sendToContentScript]);

  const handleClear = useCallback(async () => {
    if (inspectState === "inspecting") {
      try {
        await sendToContentScript({ type: "stop-inspect" });
      } catch {
        // ignore
      }
    }
    setInspectState("idle");
    setSelectedElement(null);
    setProcessing(null);
    setChangeResult(null);
    setPendingPlan(null);
    setStreamedText("");
    setStatusLog([]);
    setConsoleErrors([]);
    activeRequestId.current = null;
    inspectTabId.current = null;
    if (activeTabId.current) chrome.storage.local.remove(pendingKey(activeTabId.current));
  }, [inspectState, sendToContentScript]);

  const handleElementHover = useCallback(async () => {
    try {
      await sendToContentScript({ type: "highlight-element" });
    } catch {
      // ignore
    }
  }, [sendToContentScript]);

  const handleElementLeave = useCallback(async () => {
    try {
      await sendToContentScript({ type: "clear-highlight" });
    } catch {
      // ignore
    }
  }, [sendToContentScript]);

  const handleAncestorHover = useCallback(
    async (xpath: string) => {
      try {
        await sendToContentScript({ type: "highlight-ancestor", xpath });
      } catch {
        // ignore
      }
    },
    [sendToContentScript],
  );

  const handleAncestorLeave = useCallback(async () => {
    try {
      await sendToContentScript({ type: "clear-highlight" });
    } catch {
      // ignore
    }
  }, [sendToContentScript]);

  const handleAncestorSelect = useCallback(
    async (xpath: string) => {
      try {
        // Content script re-selects and broadcasts a new element_selection
        // message; selectedElement updates via the existing onRuntimeMessage
        // listener. Reset transient result state so the new selection starts fresh.
        await sendToContentScript({ type: "select-ancestor", xpath });
        setProcessing(null);
        setChangeResult(null);
        setPendingPlan(null);
        setStreamedText("");
        setStatusLog([]);
      } catch {
        // transientError already set
      }
    },
    [sendToContentScript],
  );

  const handleSendChange = useCallback(
    (description: string, imageDataUrl?: string, mode: ChangeMode = "quick") => {
      if (!selectedElement) return;
      const requestId = crypto.randomUUID();
      activeRequestId.current = requestId;
      setProcessing(null);
      setChangeResult(null);
      setPendingPlan(null);
      setStreamedText("");
      setStatusLog([]);

      const pageSource: PageSource = selectedElement.pageSource ?? "localhost";
      const changeRequest: ChangeRequest = {
        type: "change_request",
        requestId,
        description,
        elementXpath: selectedElement.xpath,
        componentName: selectedElement.componentName,
        ancestors: selectedElement.ancestors,
        sourceFile: selectedElement.sourceFile,
        sourceLine: selectedElement.sourceLine,
        sourceColumn: selectedElement.sourceColumn,
        screenshotDataUrl: imageDataUrl,
        boundingRect: selectedElement.boundingRect,
        computedStyles: selectedElement.computedStyles,
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
        pageSource,
        filePath: selectedElement.filePath,
        mode,
      };
      send(changeRequest);
      if (activeTabId.current) {
        chrome.storage.local.set({
          [pendingKey(activeTabId.current)]: { requestId, element: selectedElement },
        });
      }
      setConsoleErrors([]);
    },
    [selectedElement, consoleErrors, send],
  );

  const handleApprovePlan = useCallback(() => {
    const requestId = activeRequestId.current;
    if (!requestId) return;
    setPendingPlan(null);
    setStatusLog([]);
    setStreamedText("");
    setProcessing({
      type: "status_update",
      requestId,
      status: "applying",
      message: "Executing approved plan…",
    });
    send({ type: "plan_approval", requestId, approve: true });
  }, [send]);

  const handleCancelPlan = useCallback(() => {
    const requestId = activeRequestId.current;
    if (requestId) {
      send({ type: "plan_approval", requestId, approve: false });
    }
    setPendingPlan(null);
    setProcessing(null);
    setStatusLog([]);
    setStreamedText("");
    activeRequestId.current = null;
    if (activeTabId.current) chrome.storage.local.remove(pendingKey(activeTabId.current));
  }, [send]);

  const handleRetry = useCallback(() => {
    setProcessing(null);
    setChangeResult(null);
    setPendingPlan(null);
    setStreamedText("");
    setStatusLog([]);
    activeRequestId.current = null;
  }, []);

  const handleClearConsoleErrors = useCallback(() => setConsoleErrors([]), []);

  if (urlKind === "other") {
    const firstTime =
      firstRun.ready && !firstRun.hasOpenedBefore && !firstRun.lastLocalhostUrl;
    return (
      <NonLocalhostBlocked
        connectionStatus={status}
        currentUrl={currentTabUrl}
        lastLocalhostUrl={firstRun.lastLocalhostUrl}
        firstTime={firstTime}
        onReconnect={reconnect}
      />
    );
  }

  return (
    <SidePanelMain
      connectionStatus={status}
      onReconnect={reconnect}
      inspectState={inspectState}
      hasUsedInspect={hasUsedInspect}
      selectedElement={selectedElement}
      processing={processing}
      changeResult={changeResult}
      pendingPlan={pendingPlan}
      streamedText={streamedText}
      statusLog={statusLog}
      consoleErrors={consoleErrors}
      transientError={transientError}
      showFileUrlBanner={urlKind === "file" && !fileUrlPermission}
      extensionId={extensionId}
      currentTabUrl={currentTabUrl}
      onStartInspect={handleStartInspect}
      onStopInspect={handleStopInspect}
      onClear={handleClear}
      onElementHover={handleElementHover}
      onElementLeave={handleElementLeave}
      onAncestorHover={handleAncestorHover}
      onAncestorLeave={handleAncestorLeave}
      onAncestorSelect={handleAncestorSelect}
      onSendChange={handleSendChange}
      onApprovePlan={handleApprovePlan}
      onCancelPlan={handleCancelPlan}
      onRetry={handleRetry}
      onClearConsoleErrors={handleClearConsoleErrors}
      onOpenSource={openInEditor}
    />
  );
}
