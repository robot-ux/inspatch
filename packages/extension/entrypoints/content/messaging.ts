import { createLogger } from '@inspatch/shared';
import type { InspectMode } from './inspect-mode';
import { getXPath, getUniqueSelector } from './element-detector';
import { queryFiber } from './fiber-bridge';
import { resolveSourceLocation, findComponentSource } from './source-resolver';

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

export async function sendElementSelection(el: Element): Promise<void> {
  const rect = el.getBoundingClientRect();
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
  };

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
      const resolved = await resolveSourceLocation(
        fiberResult.debugSource.fileName,
        fiberResult.debugSource.lineNumber,
        0,
      );
      if (resolved) {
        payload.sourceFile = resolved.source;
        payload.sourceLine = resolved.line;
        payload.sourceColumn = resolved.column;
      } else {
        payload.sourceFile = fiberResult.debugSource.fileName;
        payload.sourceLine = fiberResult.debugSource.lineNumber;
      }
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
