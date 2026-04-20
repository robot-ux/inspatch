import { createLogger } from '@inspatch/shared';

const logger = createLogger('fiber');

export interface FiberBundle {
  self: {
    componentName: string | null;
    debugSource: { fileName: string; lineNumber: number } | null;
  };
  ancestorComponents: (string | null)[];
}

const NULL_BUNDLE: FiberBundle = {
  self: { componentName: null, debugSource: null },
  ancestorComponents: [],
};

let injectedScript: HTMLScriptElement | null = null;
let bridgeReady = false;
let queryCounter = 0;

const pendingQueries = new Map<
  string,
  { resolve: (result: FiberBundle) => void; timer: ReturnType<typeof setTimeout> }
>();

function toBundle(detail: any): FiberBundle {
  const selfIn = detail?.self ?? {};
  return {
    self: {
      componentName: typeof selfIn.componentName === "string" ? selfIn.componentName : null,
      debugSource:
        selfIn.debugSource && typeof selfIn.debugSource.fileName === "string"
          ? selfIn.debugSource
          : null,
    },
    ancestorComponents: Array.isArray(detail?.ancestorComponents)
      ? detail.ancestorComponents.map((v: unknown) => (typeof v === "string" ? v : null))
      : [],
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
): Promise<FiberBundle> {
  if (!bridgeReady || !injectedScript) {
    return Promise.resolve({ ...NULL_BUNDLE, ancestorComponents: ancestorSelectors.map(() => null) });
  }

  const queryId = `fq-${++queryCounter}`;

  return new Promise<FiberBundle>((resolve) => {
    const timer = setTimeout(() => {
      pendingQueries.delete(queryId);
      resolve({ ...NULL_BUNDLE, ancestorComponents: ancestorSelectors.map(() => null) });
    }, 2000);

    pendingQueries.set(queryId, { resolve, timer });

    injectedScript!.dispatchEvent(
      new CustomEvent("inspatch-fiber-query", {
        detail: { selfSelector, ancestorSelectors, queryId },
      }),
    );
  });
}
