import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeRequest,
  ChangeResult,
  ConsoleError,
  ElementSelection,
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

function isLocalhostUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
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
  const [streamedText, setStreamedText] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [consoleErrors, setConsoleErrors] = useState<ConsoleError[]>([]);
  const [isLocalhost, setIsLocalhost] = useState(true);
  const [currentTabUrl, setCurrentTabUrl] = useState<string | undefined>(undefined);
  const [hasUsedInspect, setHasUsedInspect] = useState(false);

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
      activeRequestId.current = null;
      if (activeTabId.current) chrome.storage.local.remove(pendingKey(activeTabId.current));
    } else if (lastMessage.type === "resume_not_found") {
      if (activeTabId.current) chrome.storage.local.remove(pendingKey(activeTabId.current));
      setProcessing(null);
      setSelectedElement(null);
      setHasUsedInspect(false);
      activeRequestId.current = null;
    }
  }, [lastMessage]);

  const sendToContentScript = useCallback(async (message: { type: string }) => {
    setTransientError(null);
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      setTransientError("No active tab found");
      return;
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      setTransientError("Content script not loaded — refresh the localhost page and try again");
      throw new Error("Content script not available");
    }
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
      if (tab?.url?.startsWith("http")) {
        const localhost = isLocalhostUrl(tab.url);
        setIsLocalhost(localhost);
        if (localhost) firstRun.markOpenedWithLocalhost(tab.url);
      } else if (!tab?.url) {
        setIsLocalhost(false);
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

  const handleSendChange = useCallback(
    (description: string, imageDataUrl?: string) => {
      if (!selectedElement) return;
      const requestId = crypto.randomUUID();
      activeRequestId.current = requestId;
      setProcessing(null);
      setChangeResult(null);
      setStreamedText("");
      setStatusLog([]);

      const changeRequest: ChangeRequest = {
        type: "change_request",
        requestId,
        description,
        elementXpath: selectedElement.xpath,
        componentName: selectedElement.componentName,
        parentChain: selectedElement.parentChain,
        sourceFile: selectedElement.sourceFile,
        sourceLine: selectedElement.sourceLine,
        sourceColumn: selectedElement.sourceColumn,
        screenshotDataUrl: imageDataUrl,
        boundingRect: selectedElement.boundingRect,
        computedStyles: selectedElement.computedStyles,
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
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

  const handleRetry = useCallback(() => {
    setProcessing(null);
    setChangeResult(null);
    setStreamedText("");
    setStatusLog([]);
    activeRequestId.current = null;
  }, []);

  const handleClearConsoleErrors = useCallback(() => setConsoleErrors([]), []);

  if (!isLocalhost) {
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
      streamedText={streamedText}
      statusLog={statusLog}
      consoleErrors={consoleErrors}
      transientError={transientError}
      onStartInspect={handleStartInspect}
      onStopInspect={handleStopInspect}
      onClear={handleClear}
      onElementHover={handleElementHover}
      onElementLeave={handleElementLeave}
      onSendChange={handleSendChange}
      onRetry={handleRetry}
      onClearConsoleErrors={handleClearConsoleErrors}
      onOpenSource={openInEditor}
    />
  );
}
