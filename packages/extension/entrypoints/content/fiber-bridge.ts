export interface FiberResult {
  componentName: string | null;
  parentChain: string[];
  debugSource: { fileName: string; lineNumber: number } | null;
}

const NULL_RESULT: FiberResult = { componentName: null, parentChain: [], debugSource: null };

let injectedScript: HTMLScriptElement | null = null;
let bridgeReady = false;
let queryCounter = 0;

const pendingQueries = new Map<
  string,
  { resolve: (result: FiberResult) => void; timer: ReturnType<typeof setTimeout> }
>();

function handleFiberResult(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail || !detail.queryId) return;

  const pending = pendingQueries.get(detail.queryId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingQueries.delete(detail.queryId);

  pending.resolve({
    componentName: typeof detail.componentName === "string" ? detail.componentName : null,
    parentChain: Array.isArray(detail.parentChain) ? detail.parentChain : [],
    debugSource: detail.debugSource && typeof detail.debugSource.fileName === "string"
      ? detail.debugSource
      : null,
  });
}

export function initFiberBridge(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const scriptUrl = chrome.runtime.getURL("fiber-main-world.js");
      console.log("[Inspatch] Injecting fiber script from:", scriptUrl);

      const script = document.createElement("script");
      script.src = scriptUrl;

      script.addEventListener("inspatch-fiber-result", handleFiberResult);

      script.onload = () => {
        injectedScript = script;
        bridgeReady = true;
        console.log("[Inspatch] Fiber bridge ready");
        resolve();
      };

      script.onerror = (err) => {
        console.warn("[Inspatch] Fiber script failed to load:", err);
        bridgeReady = false;
        resolve();
      };

      (document.head || document.documentElement).appendChild(script);
    } catch (err) {
      console.warn("[Inspatch] Fiber bridge injection failed:", err);
      bridgeReady = false;
      resolve();
    }
  });
}

export function queryFiber(selector: string): Promise<FiberResult> {
  if (!bridgeReady || !injectedScript) {
    console.log("[Inspatch] queryFiber skipped — bridge not ready");
    return Promise.resolve(NULL_RESULT);
  }

  const queryId = `fq-${++queryCounter}`;

  return new Promise<FiberResult>((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[Inspatch] Fiber query timed out for:", selector);
      pendingQueries.delete(queryId);
      resolve(NULL_RESULT);
    }, 2000);

    pendingQueries.set(queryId, { resolve, timer });

    injectedScript!.dispatchEvent(
      new CustomEvent("inspatch-fiber-query", { detail: { selector, queryId } }),
    );
  });
}

export function isBridgeReady(): boolean {
  return bridgeReady;
}
