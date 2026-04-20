import { createLogger, type AncestorInfo } from '@inspatch/shared';
import type { InspectMode } from './inspect-mode';
import { getXPath, getUniqueSelector } from './element-detector';
import { queryFiberBundle } from './fiber-bridge';
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

// DOM ancestor walk depth. Stops at <html>. Deep enough to cover typical React
// apps without making the fiber batch query too slow.
const ANCESTOR_MAX_DEPTH = 12;
const ANCESTOR_CLASS_LIMIT = 3;

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

function elementClasses(el: Element): string[] | undefined {
  const raw = typeof el.className === 'string' ? el.className : '';
  if (!raw) return undefined;
  const list = raw.split(/\s+/).filter(Boolean);
  return list.length > 0 ? list.slice(0, ANCESTOR_CLASS_LIMIT) : undefined;
}

interface AncestorDraft extends AncestorInfo {
  selector: string;
}

function collectAncestorDrafts(el: Element): AncestorDraft[] {
  const out: AncestorDraft[] = [];
  let cur = el.parentElement;
  while (cur && cur !== document.documentElement && out.length < ANCESTOR_MAX_DEPTH) {
    out.push({
      xpath: getXPath(cur),
      tagName: cur.tagName.toLowerCase(),
      id: cur.id || undefined,
      classes: elementClasses(cur),
      selector: getUniqueSelector(cur),
    });
    cur = cur.parentElement;
  }
  return out;
}

function resolveByXPath(xpath: string): Element | null {
  try {
    const r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return (r.singleNodeValue as Element) ?? null;
  } catch {
    return null;
  }
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
    const msg = message as { type?: string; xpath?: unknown };
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
    } else if (msg?.type === 'highlight-ancestor' && typeof msg.xpath === 'string') {
      const el = resolveByXPath(msg.xpath);
      if (el) inspectMode.highlightElement(el);
      sendResponse({ ok: !!el });
    } else if (msg?.type === 'select-ancestor' && typeof msg.xpath === 'string') {
      const el = resolveByXPath(msg.xpath);
      if (el) {
        inspectMode.clearHighlight();
        // Fire-and-forget: re-selection broadcasts a new element_selection
        // message back to the side panel via sendElementSelection.
        sendElementSelection(el).catch(() => {});
      }
      sendResponse({ ok: !!el });
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
    // Ancestors still populated (without componentName) so the UI tree works.
    const drafts = collectAncestorDrafts(el);
    if (drafts.length > 0) {
      payload.ancestors = drafts.map(({ selector: _s, ...rest }) => rest);
    }
    logger.debug('Sending element selection (file://):', payload.tagName);
    chrome.runtime.sendMessage(payload).catch(() => {});
    return;
  }

  const drafts = collectAncestorDrafts(el);

  try {
    const selfSelector = getUniqueSelector(el);
    const ancestorSelectors = drafts.map((d) => d.selector);
    const bundle = await queryFiberBundle(selfSelector, ancestorSelectors);

    if (bundle.self.componentName) {
      payload.componentName = bundle.self.componentName;
    }

    if (drafts.length > 0) {
      const ancestors: AncestorInfo[] = drafts.map((d, i) => {
        const componentName = bundle.ancestorComponents[i] ?? undefined;
        const { selector: _s, ...rest } = d;
        return componentName ? { ...rest, componentName } : rest;
      });
      payload.ancestors = ancestors;
    }

    if (bundle.self.debugSource) {
      // _debugSource.fileName is already the original source path — use it directly.
      // Re-running through source map resolution would produce wrong line numbers.
      payload.sourceFile = normalizeSourcePath(bundle.self.debugSource.fileName);
      payload.sourceLine = bundle.self.debugSource.lineNumber;
    } else if (bundle.self.componentName) {
      const found = await findComponentSource(bundle.self.componentName);
      if (found) {
        payload.sourceFile = found.source;
        payload.sourceLine = found.line;
        payload.sourceColumn = found.column;
      }
    }
  } catch {
    // Enrichment failed — still ship ancestors (DOM-only) so the UI tree renders.
    if (drafts.length > 0) {
      payload.ancestors = drafts.map(({ selector: _s, ...rest }) => rest);
    }
  }

  logger.debug('Sending element selection:', payload.tagName, payload.componentName ?? '(no component)');
  chrome.runtime.sendMessage(payload).catch(() => {});
}
