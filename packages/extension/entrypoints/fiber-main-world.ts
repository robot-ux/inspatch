export default defineUnlistedScript(() => {
  const scriptEl = document.currentScript;
  if (!scriptEl) return;

  function getComponentName(fiber: any): string | null {
    const type = fiber.type;
    if (!type) return null;
    if (typeof type === "string") return null;
    if (typeof type === "function") return type.displayName || type.name || null;
    if (type.$$typeof) {
      const sym = type.$$typeof.toString();
      if (sym.includes("forward_ref")) {
        return type.displayName || type.render?.displayName || type.render?.name || null;
      }
      if (sym.includes("memo")) {
        return type.displayName || getComponentName({ type: type.type }) || null;
      }
    }
    return null;
  }

  function findFiberKey(el: Element): string | null {
    for (const key of Object.keys(el)) {
      if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
        return key;
      }
    }
    return null;
  }

  // Walks fiber.return until a named component is found. Returns both the
  // component name and that fiber's _debugSource when available (dev builds
  // only). Used for every DOM node in the snapshot tree.
  function nearestComponent(
    fiber: any,
  ): { componentName: string | null; debugSource: { fileName: string; lineNumber: number } | null } {
    let cur = fiber;
    while (cur) {
      const name = getComponentName(cur);
      if (name) {
        return { componentName: name, debugSource: cur._debugSource ?? null };
      }
      cur = cur.return;
    }
    return { componentName: null, debugSource: null };
  }

  // startFiber._debugSource points to where this exact JSX node is written —
  // the most precise location for editing. Falls back to the nearest component
  // fiber's _debugSource when the host fiber itself has none.
  function extractSelfFiberData(el: Element) {
    const key = findFiberKey(el);
    let host: Element | null = el;
    let fiberKey = key;
    while (!fiberKey && host) {
      host = host.parentElement;
      if (host) fiberKey = findFiberKey(host);
    }
    if (!fiberKey || !host) {
      return { componentName: null, debugSource: null };
    }
    const fiber = (host as any)[fiberKey];
    let debugSource: { fileName: string; lineNumber: number } | null =
      fiber?._debugSource ?? null;

    let componentName: string | null = null;
    let cur = fiber;
    while (cur) {
      const name = getComponentName(cur);
      if (name) {
        if (componentName === null) {
          componentName = name;
          if (!debugSource) debugSource = cur._debugSource ?? null;
          break;
        }
      }
      cur = cur.return;
    }
    return { componentName, debugSource };
  }

  function rowInfoForSelector(selector: string) {
    const el = document.querySelector(selector);
    if (!el) return { componentName: null, debugSource: null };
    const key = findFiberKey(el);
    if (!key) return { componentName: null, debugSource: null };
    return nearestComponent((el as any)[key]);
  }

  function extractBundle(
    selfSelector: string,
    ancestorSelectors: string[],
    descendantSelectors: string[],
    queryId: string,
  ) {
    const el = document.querySelector(selfSelector);
    const self = el
      ? extractSelfFiberData(el)
      : { componentName: null, debugSource: null };
    const ancestors = ancestorSelectors.map(rowInfoForSelector);
    const descendants = descendantSelectors.map(rowInfoForSelector);
    return { self, ancestors, descendants, queryId };
  }

  scriptEl.addEventListener("inspatch-fiber-query", ((e: CustomEvent) => {
    const { selfSelector, ancestorSelectors, descendantSelectors, queryId } = e.detail ?? {};
    if (typeof selfSelector !== "string" || typeof queryId !== "string") return;
    const aSelectors = Array.isArray(ancestorSelectors) ? ancestorSelectors : [];
    const dSelectors = Array.isArray(descendantSelectors) ? descendantSelectors : [];
    const result = extractBundle(selfSelector, aSelectors, dSelectors, queryId);
    scriptEl.dispatchEvent(new CustomEvent("inspatch-fiber-result", { detail: result }));
  }) as EventListener);
});
