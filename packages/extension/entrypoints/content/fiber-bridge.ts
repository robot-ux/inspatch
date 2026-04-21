import { createLogger } from '@inspatch/shared';

const logger = createLogger('fiber');

export interface RowFiberInfo {
  componentName: string | null;
  debugSource: { fileName: string; lineNumber: number } | null;
}

export interface FiberBundle {
  self: RowFiberInfo;
  ancestors: RowFiberInfo[];
  descendants: RowFiberInfo[];
}

const NULL_ROW: RowFiberInfo = { componentName: null, debugSource: null };

let injectedScript: HTMLScriptElement | null = null;
let bridgeReady = false;
let queryCounter = 0;

const pendingQueries = new Map<
  string,
  { resolve: (result: FiberBundle) => void; timer: ReturnType<typeof setTimeout> }
>();

function toRow(v: unknown): RowFiberInfo {
  const r = v as { componentName?: unknown; debugSource?: { fileName?: unknown; lineNumber?: unknown } } | null;
  if (!r) return NULL_ROW;
  const componentName = typeof r.componentName === "string" ? r.componentName : null;
  const debugSource =
    r.debugSource && typeof r.debugSource.fileName === "string"
      ? { fileName: r.debugSource.fileName, lineNumber: Number(r.debugSource.lineNumber) || 0 }
      : null;
  return { componentName, debugSource };
}

function toBundle(detail: any): FiberBundle {
  return {
    self: toRow(detail?.self),
    ancestors: Array.isArray(detail?.ancestors) ? detail.ancestors.map(toRow) : [],
    descendants: Array.isArray(detail?.descendants) ? detail.descendants.map(toRow) : [],
  };
}

function handleFiberResult(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail || typeof detail.queryId !== "string") return;

  const pending = pendingQueries.get(detail.queryId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingQueries.delete(detail.queryId);
  pending.resolve(toBundle(detail));
}

export function initFiberBridge(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const scriptUrl = chrome.runtime.getURL("fiber-main-world.js");
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.addEventListener("inspatch-fiber-result", handleFiberResult);

      script.onload = () => {
        injectedScript = script;
        bridgeReady = true;
        logger.debug('Fiber bridge ready');
        resolve();
      };

      script.onerror = () => {
        bridgeReady = false;
        logger.warn('Fiber bridge script failed to load');
        resolve();
      };

      (document.head || document.documentElement).appendChild(script);
    } catch {
      bridgeReady = false;
      resolve();
    }
  });
}

export function queryFiberBundle(
  selfSelector: string,
  ancestorSelectors: string[],
  descendantSelectors: string[],
): Promise<FiberBundle> {
  const fallback = (): FiberBundle => ({
    self: NULL_ROW,
    ancestors: ancestorSelectors.map(() => NULL_ROW),
    descendants: descendantSelectors.map(() => NULL_ROW),
  });

  if (!bridgeReady || !injectedScript) {
    return Promise.resolve(fallback());
  }

  const queryId = `fq-${++queryCounter}`;

  return new Promise<FiberBundle>((resolve) => {
    const timer = setTimeout(() => {
      pendingQueries.delete(queryId);
      resolve(fallback());
    }, 2000);

    pendingQueries.set(queryId, { resolve, timer });

    injectedScript!.dispatchEvent(
      new CustomEvent("inspatch-fiber-query", {
        detail: { selfSelector, ancestorSelectors, descendantSelectors, queryId },
      }),
    );
  });
}
