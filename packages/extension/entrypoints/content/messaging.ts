import { createLogger, type AncestorInfo, type DescendantInfo } from '@inspatch/shared';
import type { InspectMode } from './inspect-mode';
import { getXPath, getUniqueSelector } from './element-detector';
import { queryFiberBundle, type RowFiberInfo } from './fiber-bridge';
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

// Tree window around the inspected anchor: 2 ancestor levels + anchor + 2
// descendant levels (5 levels total). DESCENDANT_MAX_COUNT caps sibling breadth
// so wide subtrees don't blow up the side panel.
const ANCESTOR_MAX_DEPTH = 2;
const DESCENDANT_MAX_DEPTH = 2;
const DESCENDANT_MAX_COUNT = 6;
const CLASS_LIMIT = 3;

// Set by content.ts after overlay host is created. Nullable so hot-reload in
// dev (where the script re-imports before content.ts runs) doesn't crash.
let overlayHostRef: HTMLElement | null = null;
export function setOverlayHost(host: HTMLElement): void {
  overlayHostRef = host;
}
function isOverlayNode(el: Element): boolean {
  return el.tagName.toLowerCase() === 'inspatch-overlay' || el === overlayHostRef;
}

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
  return list.length > 0 ? list.slice(0, CLASS_LIMIT) : undefined;
}

interface AncestorDraft extends AncestorInfo {
  selector: string;
}
interface DescendantDraft extends DescendantInfo {
  selector: string;
}

function describeElement(el: Element) {
  return {
    xpath: getXPath(el),
    tagName: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: elementClasses(el),
    selector: getUniqueSelector(el),
  };
}

function collectAncestorDrafts(el: Element): AncestorDraft[] {
  const out: AncestorDraft[] = [];
  let cur = el.parentElement;
  while (cur && cur !== document.documentElement && out.length < ANCESTOR_MAX_DEPTH) {
    if (!isOverlayNode(cur)) out.push(describeElement(cur));
    cur = cur.parentElement;
  }
  return out;
}

// DFS-limited walk: depth<=2, <=6 total. Keeps the tree preview compact while
// covering "2 levels of children" intent.
function collectDescendantDrafts(root: Element): DescendantDraft[] {
  const out: DescendantDraft[] = [];
  function walk(el: Element, depth: number) {
    if (depth > DESCENDANT_MAX_DEPTH) return;
    for (const child of Array.from(el.children)) {
      if (out.length >= DESCENDANT_MAX_COUNT) return;
      if (isOverlayNode(child)) continue;
      out.push({ ...describeElement(child), depth });
      walk(child, depth + 1);
    }
  }
  walk(root, 1);
  return out;
}

// getXPath omits the /html root (walks up to documentElement exclusive), so
// the result looks like "/body[1]/div[1]/...". Against `document`, an absolute
// XPath like /body[1] doesn't resolve because <html> is the only element child.
// Prefixing an extra slash turns it into descendant axis "//body[1]/..." which
// matches from anywhere — exactly one body element per page in practice.
function resolveByXPath(xpath: string): Element | null {
  if (!xpath) return null;
  const normalized = xpath.startsWith('//') ? xpath : '/' + xpath;
  try {
    const r = document.evaluate(normalized, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
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
    } else if (msg?.type === 'highlight-by-xpath' && typeof msg.xpath === 'string') {
      const el = resolveByXPath(msg.xpath);
      if (el) inspectMode.highlightElement(el);
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

function stripSelector<T extends { selector: string }>(d: T): Omit<T, 'selector'> {
  const { selector: _s, ...rest } = d;
  return rest;
}

function enrichRow<T extends AncestorInfo>(base: T, row: RowFiberInfo | undefined): T {
  if (!row) return base;
  const out: T = { ...base };
  if (row.componentName) out.componentName = row.componentName;
  if (row.debugSource) {
    out.sourceFile = normalizeSourcePath(row.debugSource.fileName);
    out.sourceLine = row.debugSource.lineNumber;
  }
  return out;
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

  const ancestorDrafts = collectAncestorDrafts(el);
  const descendantDrafts = collectDescendantDrafts(el);

  if (isFileUrl) {
    const filePath = filePathFromLocation();
    if (filePath) payload.filePath = filePath;
    // DOM-only mode — React Fiber / sourcemap enrichment is intentionally skipped.
    // Tree still populated (sans componentName) so the UI renders navigation.
    if (ancestorDrafts.length > 0) payload.ancestors = ancestorDrafts.map(stripSelector);
    if (descendantDrafts.length > 0) payload.descendants = descendantDrafts.map(stripSelector);
    logger.debug('Sending element selection (file://):', payload.tagName);
    chrome.runtime.sendMessage(payload).catch(() => {});
    return;
  }

  try {
    const selfSelector = getUniqueSelector(el);
    const bundle = await queryFiberBundle(
      selfSelector,
      ancestorDrafts.map((d) => d.selector),
      descendantDrafts.map((d) => d.selector),
    );

    if (bundle.self.componentName) payload.componentName = bundle.self.componentName;

    if (ancestorDrafts.length > 0) {
      payload.ancestors = ancestorDrafts.map((d, i) =>
        enrichRow(stripSelector(d), bundle.ancestors[i]),
      );
    }
    if (descendantDrafts.length > 0) {
      payload.descendants = descendantDrafts.map((d, i) =>
        enrichRow(stripSelector(d), bundle.descendants[i]),
      );
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
    // Enrichment failed — still ship tree data (DOM-only) so the UI works.
    if (ancestorDrafts.length > 0) payload.ancestors = ancestorDrafts.map(stripSelector);
    if (descendantDrafts.length > 0) payload.descendants = descendantDrafts.map(stripSelector);
  }

  logger.debug('Sending element selection:', payload.tagName, payload.componentName ?? '(no component)');
  chrome.runtime.sendMessage(payload).catch(() => {});
}
