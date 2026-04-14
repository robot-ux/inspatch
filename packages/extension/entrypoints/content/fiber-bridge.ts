export interface FiberResult {
  componentName: string | null;
  parentChain: string[];
  debugSource: { fileName: string; lineNumber: number } | null;
}

const NULL_RESULT: FiberResult = { componentName: null, parentChain: [], debugSource: null };

let injectedScript: HTMLElement | null = null;
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

export async function initFiberBridge(): Promise<void> {
  try {
    const { injectScript } = await import("wxt/utils/inject-script");
    const result = await injectScript("/fiber-main-world.js", { keepInDom: true });

    injectedScript = result.script;
    result.script.addEventListener("inspatch-fiber-result", handleFiberResult);
    bridgeReady = true;
  } catch (err) {
    console.warn("[Inspatch] Fiber bridge injection failed:", err);
    bridgeReady = false;
  }
}

export function queryFiber(selector: string): Promise<FiberResult> {
  if (!bridgeReady || !injectedScript) {
    return Promise.resolve(NULL_RESULT);
  }

  const queryId = `fq-${++queryCounter}`;

  return new Promise<FiberResult>((resolve) => {
    const timer = setTimeout(() => {
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
