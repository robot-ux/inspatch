import { useState, useEffect, useCallback, useRef } from 'react';
import type { ElementSelection, ChangeRequest, StatusUpdate, ChangeResult } from '@inspatch/shared';
import { useWebSocket, type ConnectionStatus } from './hooks/useWebSocket';
import { ChangeInput } from './components/ChangeInput';
import { ProcessingStatus } from './components/ProcessingStatus';

type SidebarState = 'idle' | 'inspecting' | 'selected';

const statusConfig: Record<ConnectionStatus, { dotClass: string; label: string }> = {
  connected: { dotClass: 'bg-green-500 animate-status-dot', label: 'Connected' },
  reconnecting: { dotClass: 'bg-yellow-500 animate-pulse', label: 'Reconnecting...' },
  disconnected: { dotClass: 'bg-gray-400', label: 'Disconnected' },
};

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
      <div className="flex flex-col h-screen bg-white">
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-200">
          <button
            onClick={status !== 'connected' ? reconnect : undefined}
            className={`flex items-center gap-2 ${status !== 'connected' ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            title={status !== 'connected' ? 'Click to reconnect' : ''}
          >
            <div className={`w-2 h-2 rounded-full ${statusConfig[status].dotClass}`} />
            <span className="text-xs text-gray-500">{statusConfig[status].label}</span>
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3 animate-fade-in">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <span className="text-lg text-gray-400">&#128274;</span>
          </div>
          <p className="text-sm font-medium text-gray-600 text-center">Localhost only</p>
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Inspatch works with locally-served pages.<br />
            Navigate to a <span className="font-mono text-gray-500">localhost</span> URL to start inspecting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-end px-4 py-2 border-b border-gray-200">
        <button
          onClick={status !== 'connected' ? reconnect : undefined}
          className={`flex items-center gap-2 ${status !== 'connected' ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
          title={status !== 'connected' ? 'Click to reconnect' : ''}
        >
          <div className={`w-2 h-2 rounded-full ${statusConfig[status].dotClass}`} />
          <span className="text-xs text-gray-500">
            {statusConfig[status].label}
          </span>
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 animate-slide-down">
          <p className="text-xs text-amber-700">{error}</p>
        </div>
      )}

      <div className="px-4 py-3 border-b border-gray-200">
        {sidebarState === 'idle' && !selectedElement && (
          <button
            onClick={handleStartInspect}
            disabled={status !== 'connected'}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            Start Inspect
          </button>
        )}
        {sidebarState === 'idle' && selectedElement && (
          <div className="flex gap-2">
            <button
              onClick={handleInspectAgain}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Inspect Again
            </button>
            <button
              onClick={handleStopInspect}
              className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        )}
        {sidebarState === 'inspecting' && (
          <button
            onClick={handleStopInspect}
            className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors animate-glow-pulse"
            style={{ '--tw-shadow-color': 'rgba(220, 38, 38, 0.3)' } as React.CSSProperties}
          >
            Stop Inspect
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sidebarState !== 'inspecting' && !selectedElement && status !== 'connected' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-2 animate-fade-in">
            <p className="text-sm text-gray-500 text-center">
              Server not connected. Start the Inspatch server:
            </p>
            <div className="w-full bg-gray-900 rounded-lg p-3">
              <code className="text-xs text-green-400 block whitespace-pre-wrap">
                {`cd your-project\nbunx @inspatch/server --project .`}
              </code>
            </div>
            <button
              onClick={reconnect}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Reconnect
            </button>
            <p className="text-[11px] text-gray-400 text-center">
              Requires <span className="font-mono">bun</span> and <span className="font-mono">claude</span> CLI to be installed
            </p>
          </div>
        )}
        {sidebarState !== 'inspecting' && !selectedElement && status === 'connected' && (
          <div className="flex items-center justify-center h-full animate-fade-in">
            <p className="text-sm text-gray-400 text-center">
              Select an element to get started
            </p>
          </div>
        )}
        {sidebarState === 'inspecting' && (
          <div className="flex items-center justify-center h-full animate-fade-in">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <p className="text-sm text-gray-500 text-center">
                Click any element on the page to select it
              </p>
            </div>
          </div>
        )}
        {selectedElement && sidebarState !== 'inspecting' && (
          <div
            className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-200 hover:shadow-md animate-slide-up"
            onMouseEnter={handleElementHover}
            onMouseLeave={handleElementLeave}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-mono font-semibold text-gray-900">
                {selectedElement.tagName}
              </span>
              <span className="text-sm font-mono text-gray-500">
                {selectedElement.boundingRect.width}×{selectedElement.boundingRect.height}
              </span>
            </div>
            {selectedElement.id && (
              <p className="text-sm font-mono text-blue-600">#{selectedElement.id}</p>
            )}
            {selectedElement.className && (
              <p className="text-sm font-mono text-gray-600">
                {selectedElement.className.split(/\s+/).filter(Boolean).map(c => `.${c}`).join(' ')}
              </p>
            )}
            <p className="text-xs font-mono text-gray-400 truncate" title={selectedElement.xpath}>
              {selectedElement.xpath}
            </p>

            <div className="border-t border-gray-100 pt-2 mt-2 space-y-1.5">
              {selectedElement.componentName ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">&lt;/&gt;</span>
                    <span className="text-sm font-mono font-medium text-purple-600">
                      {selectedElement.componentName}
                    </span>
                  </div>
                  {selectedElement.parentChain && selectedElement.parentChain.length > 1 && (() => {
                    const chain = selectedElement.parentChain!;
                    const display = chain.length > 5 ? chain.slice(-4) : chain;
                    return (
                      <p className="text-xs font-mono text-gray-400 truncate">
                        {chain.length > 5 && <span>… {'>'} </span>}
                        {display.map((name, i) => (
                          <span key={i}>
                            {i > 0 && <span className="text-gray-300"> {'>'} </span>}
                            <span className="text-gray-500">{name}</span>
                          </span>
                        ))}
                      </p>
                    );
                  })()}
                  {selectedElement.sourceFile && (() => {
                    const parts = selectedElement.sourceFile!.split('/');
                    const truncated = parts.length > 3
                      ? '…/' + parts.slice(-3).join('/')
                      : selectedElement.sourceFile!;
                    return (
                      <p className="text-xs font-mono text-green-600 truncate" title={selectedElement.sourceFile}>
                        {truncated}{selectedElement.sourceLine ? `:${selectedElement.sourceLine}` : ''}
                      </p>
                    );
                  })()}
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">No React component detected</p>
              )}
            </div>
          </div>
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
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
          <p className="text-[11px] text-amber-600">
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
