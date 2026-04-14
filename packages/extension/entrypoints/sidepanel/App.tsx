import { useState, useEffect, useCallback } from 'react';
import type { ElementSelection } from '@inspatch/shared';

type SidebarState = 'idle' | 'inspecting' | 'selected';

export default function App() {
  const [connected] = useState(false);
  const [sidebarState, setSidebarState] = useState<SidebarState>('idle');
  const [selectedElement, setSelectedElement] = useState<ElementSelection | null>(null);

  const sendToContentScript = useCallback(async (message: { type: string }) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;
    return chrome.tabs.sendMessage(tab.id, message);
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
          setSelectedElement(null);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleStartInspect = useCallback(async () => {
    await sendToContentScript({ type: 'start-inspect' });
    setSidebarState('inspecting');
  }, [sendToContentScript]);

  const handleStopInspect = useCallback(async () => {
    await sendToContentScript({ type: 'stop-inspect' });
    setSidebarState('idle');
    setSelectedElement(null);
  }, [sendToContentScript]);

  const handleInspectAgain = useCallback(async () => {
    setSelectedElement(null);
    await sendToContentScript({ type: 'start-inspect' });
    setSidebarState('inspecting');
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

      <div className="px-4 py-3 border-b border-gray-200">
        {sidebarState === 'idle' && (
          <button
            onClick={handleStartInspect}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Start Inspect
          </button>
        )}
        {sidebarState === 'inspecting' && (
          <button
            onClick={handleStopInspect}
            className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Stop Inspect
          </button>
        )}
        {sidebarState === 'selected' && (
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
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sidebarState === 'idle' && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400 text-center">
              Select an element to get started
            </p>
          </div>
        )}
        {sidebarState === 'inspecting' && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500 text-center">
              Hover over elements on the page, then Alt+Click to select
            </p>
          </div>
        )}
        {sidebarState === 'selected' && selectedElement && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2">
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
