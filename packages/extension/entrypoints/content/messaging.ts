import { createLogger } from '@inspatch/shared';
import type { InspectMode } from './inspect-mode';
import { getXPath, getUniqueSelector } from './element-detector';
import { queryFiber } from './fiber-bridge';
import { normalizeSourcePath, findComponentSource } from './source-resolver';

const logger = createLogger('messaging');

const RELEVANT_STYLE_PROPERTIES = [
  'display', 'position', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'padding', 'box-sizing',
  'flex-direction', 'justify-content', 'align-items', 'gap', 'grid-template-columns', 'grid-template-rows',
  'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'text-align', 'text-decoration', 'letter-spacing',
  'background-color', 'background-image', 'border', 'border-radius', 'opacity', 'box-shadow', 'overflow',
] as const;

const SKIP_VALUES = new Set(['', 'none', 'normal', 'auto', '0px']);

function extractComputedStyles(el: Element): Record<string, string> {
  const computed = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of RELEVANT_STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(prop);
    if (!SKIP_VALUES.has(value)) {
      styles[prop] = value;
    }
  }
  return styles;
}

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

function filePathFromLocation(): string | undefined {
  if (location.protocol !== 'file:') return undefined;
  try {
    return decodeURIComponent(location.pathname);
  } catch {
    return location.pathname;
  }
}

export async function sendElementSelection(el: Element): Promise<void> {
  const rect = el.getBoundingClientRect();
  const isFileUrl = location.protocol === 'file:';

  const payload: Record<string, unknown> = {
    type: 'element_selection',
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
    devicePixelRatio: window.devicePixelRatio,
    computedStyles: extractComputedStyles(el),
    pageSource: isFileUrl ? 'file' : 'localhost',
  };

  if (isFileUrl) {
    const filePath = filePathFromLocation();
    if (filePath) payload.filePath = filePath;
    // DOM-only mode — React Fiber / sourcemap enrichment is intentionally skipped.
    logger.debug('Sending element selection (file://):', payload.tagName);
    chrome.runtime.sendMessage(payload).catch(() => {});
    return;
  }

  try {
    const selector = getUniqueSelector(el);
    const fiberResult = await queryFiber(selector);

    if (fiberResult.componentName) {
      payload.componentName = fiberResult.componentName;
    }
    if (fiberResult.parentChain.length > 0) {
      payload.parentChain = fiberResult.parentChain;
    }

    if (fiberResult.debugSource) {
      // _debugSource.fileName is already the original source path — use it directly.
      // Re-running through source map resolution would produce wrong line numbers.
      payload.sourceFile = normalizeSourcePath(fiberResult.debugSource.fileName);
      payload.sourceLine = fiberResult.debugSource.lineNumber;
    } else if (fiberResult.componentName) {
      const found = await findComponentSource(fiberResult.componentName);
      if (found) {
        payload.sourceFile = found.source;
        payload.sourceLine = found.line;
        payload.sourceColumn = found.column;
      }
    }
  } catch {
    // Enrichment failed — send basic payload without component info
  }

  logger.debug('Sending element selection:', payload.tagName, payload.componentName ?? '(no component)');
  chrome.runtime.sendMessage(payload).catch(() => {});
}
