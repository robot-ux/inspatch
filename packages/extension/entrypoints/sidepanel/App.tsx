import { useState, useEffect, useCallback } from 'react';
import type { ElementSelection, ChangeRequest } from '@inspatch/shared';
import { useWebSocket, type ConnectionStatus } from './hooks/useWebSocket';
import { useScreenshot } from './hooks/useScreenshot';
import { ScreenshotView } from './components/ScreenshotView';
import { ChangeInput } from './components/ChangeInput';

type SidebarState = 'idle' | 'inspecting' | 'selected';

const statusConfig: Record<ConnectionStatus, { dotClass: string; label: string }> = {
  connected: { dotClass: 'bg-green-500', label: 'Connected' },
  reconnecting: { dotClass: 'bg-yellow-500 animate-pulse', label: 'Reconnecting...' },
  disconnected: { dotClass: 'bg-gray-400', label: 'Disconnected' },
};

export default function App() {
  const { status, lastMessage, send } = useWebSocket('ws://localhost:9377');
  const [sidebarState, setSidebarState] = useState<SidebarState>('idle');
  const [selectedElement, setSelectedElement] = useState<ElementSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { screenshotUrl, isCapturing, capture: captureScreenshot, clear: clearScreenshot } = useScreenshot();

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
    const listener = (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message) {
        const msg = message as { type: string };
        if (msg.type === 'element_selection') {
          const selection = message as ElementSelection;
          setSelectedElement(selection);
          setSidebarState('idle');
          captureScreenshot(selection.boundingRect, selection.devicePixelRatio ?? 1);
        } else if (msg.type === 'inspect-stopped') {
          setSidebarState('idle');
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
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
    clearScreenshot();
  }, [sendToContentScript, clearScreenshot]);

  const handleInspectAgain = useCallback(async () => {
    setSelectedElement(null);
    clearScreenshot();
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

  const handleSendChange = useCallback((description: string) => {
    if (!selectedElement) return;
    const changeRequest: ChangeRequest = {
      type: 'change_request',
      requestId: crypto.randomUUID(),
      description,
      elementXpath: selectedElement.xpath,
      componentName: selectedElement.componentName,
      parentChain: selectedElement.parentChain,
      sourceFile: selectedElement.sourceFile,
      sourceLine: selectedElement.sourceLine,
      sourceColumn: selectedElement.sourceColumn,
      screenshotDataUrl: screenshotUrl ?? undefined,
      boundingRect: selectedElement.boundingRect,
      computedStyles: selectedElement.computedStyles,
    };
    send(changeRequest);
  }, [selectedElement, screenshotUrl, send]);

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Inspatch</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusConfig[status].dotClass}`} />
          <span className="text-xs text-gray-500">
            {statusConfig[status].label}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
          <p className="text-xs text-amber-700">{error}</p>
        </div>
      )}

      <div className="px-4 py-3 border-b border-gray-200">
        {sidebarState === 'idle' && !selectedElement && (
          <button
            onClick={handleStartInspect}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
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
            className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Stop Inspect
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sidebarState !== 'inspecting' && !selectedElement && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400 text-center">
              Select an element to get started
            </p>
          </div>
        )}
        {sidebarState === 'inspecting' && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500 text-center">
              Click any element on the page to select it
            </p>
          </div>
        )}
        {selectedElement && sidebarState !== 'inspecting' && (
          <>
          <div
            className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
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
          <div className="mt-3">
            <ScreenshotView screenshotUrl={screenshotUrl} isCapturing={isCapturing} />
          </div>
          </>
        )}
      </div>

      {selectedElement && sidebarState !== 'inspecting' && (
        <ChangeInput
          onSend={handleSendChange}
          disabled={status !== 'connected'}
        />
      )}
    </div>
  );
}
