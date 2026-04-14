import { useState, useEffect, useCallback, useRef } from 'react';
import type { ElementSelection, ChangeRequest, StatusUpdate, ChangeResult } from '@inspatch/shared';
import { useWebSocket } from './hooks/useWebSocket';
import { ChangeInput } from './components/ChangeInput';
import { ProcessingStatus } from './components/ProcessingStatus';
import { HeaderBar } from './components/HeaderBar';
import { NotLocalhost } from './components/NotLocalhost';
import { EmptyState } from './components/EmptyState';
import { StatusGuide } from './components/StatusGuide';
import { ElementCard } from './components/ElementCard';

type SidebarState = 'idle' | 'inspecting' | 'selected';

function isLocalhostUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return false;
  }
}

export default function App() {
  const { status, lastMessage, send, reconnect } = useWebSocket('ws://localhost:9377');
  const [sidebarState, setSidebarState] = useState<SidebarState>('idle');
  const [selectedElement, setSelectedElement] = useState<ElementSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<StatusUpdate | null>(null);
  const [changeResult, setChangeResult] = useState<ChangeResult | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const activeRequestId = useRef<string | null>(null);
  const [isLocalhost, setIsLocalhost] = useState(true);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'status_update') {
      const su = lastMessage as StatusUpdate;
      if (activeRequestId.current && su.requestId && su.requestId !== activeRequestId.current) return;
      setProcessing(su);
      if (su.streamText) {
        setStreamedText((prev) => prev + su.streamText);
      }
    } else if (lastMessage.type === 'change_result') {
      const cr = lastMessage as ChangeResult;
      if (activeRequestId.current && cr.requestId && cr.requestId !== activeRequestId.current) return;
      setChangeResult(cr);
      setProcessing(null);
      activeRequestId.current = null;
    }
  }, [lastMessage]);

  const sendToContentScript = useCallback(async (message: { type: string }) => {
    setError(null);
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      setError('No active tab found');
      return;
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      setError('Content script not loaded — refresh the localhost page and try again');
      throw new Error('Content script not available');
    }
  }, []);

  useEffect(() => {
    const checkTab = async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      setIsLocalhost(isLocalhostUrl(tab?.url));
    };
    checkTab();

    const onActivated = () => { checkTab(); };
    const onUpdated = (_tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.url !== undefined || info.status === 'complete') checkTab();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message) {
        const msg = message as { type: string };
        if (msg.type === 'element_selection') {
          setSelectedElement(message as ElementSelection);
          setSidebarState('idle');
        } else if (msg.type === 'inspect-stopped') {
          setSidebarState('idle');
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    const onTabUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (changeInfo.status === 'loading') {
        setSelectedElement(null);
        setSidebarState('idle');
        setError(null);
        setProcessing(null);
        setChangeResult(null);
        setStreamedText("");
        activeRequestId.current = null;
      }
    };
    chrome.tabs.onUpdated.addListener(onTabUpdated);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    };
  }, []);

  const handleStartInspect = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'start-inspect' });
      setSidebarState('inspecting');
    } catch { /* error already set */ }
  }, [sendToContentScript]);

  const handleStopInspect = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'stop-inspect' });
    } catch { /* ignore */ }
    setSidebarState('idle');
    setSelectedElement(null);
  }, [sendToContentScript]);

  const handleInspectAgain = useCallback(async () => {
    setSelectedElement(null);
    try {
      await sendToContentScript({ type: 'start-inspect' });
      setSidebarState('inspecting');
    } catch { /* error already set */ }
  }, [sendToContentScript]);

  const handleElementHover = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'highlight-element' });
    } catch { /* ignore */ }
  }, [sendToContentScript]);

  const handleElementLeave = useCallback(async () => {
    try {
      await sendToContentScript({ type: 'clear-highlight' });
    } catch { /* ignore */ }
  }, [sendToContentScript]);

  const handleSendChange = useCallback((description: string, imageDataUrl?: string) => {
    if (!selectedElement) return;
    const requestId = crypto.randomUUID();
    activeRequestId.current = requestId;
    setProcessing(null);
    setChangeResult(null);
    setStreamedText("");

    const changeRequest: ChangeRequest = {
      type: 'change_request',
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
    };
    send(changeRequest);
  }, [selectedElement, send]);

  if (!isLocalhost) {
    return (
      <div className="flex flex-col h-screen bg-ip-bg-primary">
        <HeaderBar status={status} onReconnect={reconnect} />
        <NotLocalhost />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-ip-bg-primary">
      <HeaderBar status={status} onReconnect={reconnect} />

      {error && (
        <div className="px-4 py-2 bg-ip-warning-muted border-b border-[rgba(245,158,11,0.3)] animate-slide-down">
          <p className="text-[11px] text-ip-warning">{error}</p>
        </div>
      )}

      <div className="px-3 py-3 border-b border-ip-border-subtle">
        {sidebarState === 'idle' && !selectedElement && (
          <button
            onClick={handleStartInspect}
            disabled={status !== 'connected'}
            className={`w-full h-9 text-white text-[13px] font-semibold rounded-ip-md transition-all ${
              status === 'connected'
                ? 'bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110 hover:shadow-ip-glow-accent'
                : 'opacity-40 bg-ip-bg-tertiary cursor-not-allowed'
            }`}
          >
            Start Inspect
          </button>
        )}
        {sidebarState === 'idle' && selectedElement && (
          <div className="flex gap-2">
            <button
              onClick={handleInspectAgain}
              className="flex-1 h-9 bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110 text-white text-[13px] font-semibold rounded-ip-md transition-all"
            >
              Inspect Again
            </button>
            <button
              onClick={handleStopInspect}
              className="h-9 px-4 bg-ip-bg-tertiary hover:bg-ip-bg-tertiary/80 text-ip-text-secondary text-[13px] font-semibold rounded-ip-md transition-colors"
            >
              Clear Selection
            </button>
          </div>
        )}
        {sidebarState === 'inspecting' && (
          <button
            onClick={handleStopInspect}
            className="w-full h-9 bg-ip-error text-white text-[13px] font-semibold rounded-ip-md transition-colors animate-glow-pulse"
          >
            Stop Inspect
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sidebarState !== 'inspecting' && !selectedElement && status !== 'connected' && (
          <StatusGuide onReconnect={reconnect} />
        )}
        {sidebarState !== 'inspecting' && !selectedElement && status === 'connected' && (
          <EmptyState state="idle" />
        )}
        {sidebarState === 'inspecting' && (
          <EmptyState state="inspecting" />
        )}
        {selectedElement && sidebarState !== 'inspecting' && (
          <ElementCard
            element={selectedElement}
            onHover={handleElementHover}
            onLeave={handleElementLeave}
          />
        )}

        {selectedElement && sidebarState !== 'inspecting' && (processing || changeResult) && (
          <div className="mt-3 animate-fade-in-scale">
            <ProcessingStatus
              statusUpdate={processing}
              changeResult={changeResult}
              streamedText={streamedText}
              onRetry={() => {
                setProcessing(null);
                setChangeResult(null);
                setStreamedText("");
                activeRequestId.current = null;
              }}
            />
          </div>
        )}
      </div>

      {selectedElement && sidebarState !== 'inspecting' && !selectedElement.sourceFile && (
        <div className="px-4 py-2 bg-ip-warning-muted border-t border-[rgba(245,158,11,0.3)]">
          <p className="text-[11px] text-ip-warning">
            No source file detected — changes may require manual file lookup.
            Ensure your dev server has source maps enabled.
          </p>
        </div>
      )}
      {selectedElement && sidebarState !== 'inspecting' && (
        <ChangeInput
          onSend={handleSendChange}
          disabled={status !== 'connected' || !!processing}
        />
      )}
    </div>
  );
}
