import { useState, useEffect, useCallback } from 'react';
import type { ElementSelection } from '@inspatch/shared';

type SidebarState = 'idle' | 'inspecting' | 'selected';

export default function App() {
  const [connected] = useState(false);
  const [sidebarState, setSidebarState] = useState<SidebarState>('idle');
  const [selectedElement, setSelectedElement] = useState<ElementSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setSelectedElement(message as ElementSelection);
          setSidebarState('selected');
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

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Inspatch</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-xs text-gray-500">
            {connected ? 'Connected' : 'Disconnected'}
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
          </div>
        )}
      </div>
    </div>
  );
}
