import type { InspectMode } from './inspect-mode';
import { getXPath } from './element-detector';

export function setupMessageListeners(
  inspectMode: InspectMode,
  getLastSelected: () => Element | null,
): () => void {
  const handler = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    const msg = message as { type?: string };
    if (msg?.type === 'start-inspect') {
      inspectMode.start();
      sendResponse({ ok: true });
    } else if (msg?.type === 'stop-inspect') {
      inspectMode.stop();
      sendResponse({ ok: true });
    } else if (msg?.type === 'highlight-element') {
      const el = getLastSelected();
      if (el) inspectMode.highlightElement(el);
      sendResponse({ ok: !!el });
    } else if (msg?.type === 'clear-highlight') {
      inspectMode.clearHighlight();
      sendResponse({ ok: true });
    }
    return true;
  };

  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

export function sendElementSelection(el: Element): void {
  const rect = el.getBoundingClientRect();
  const payload = {
    type: 'element_selection' as const,
    tagName: el.tagName.toLowerCase(),
    className: typeof el.className === 'string' ? el.className : '',
    id: el.id || undefined,
    xpath: getXPath(el),
    boundingRect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };

  chrome.runtime.sendMessage(payload).catch(() => {});
}
