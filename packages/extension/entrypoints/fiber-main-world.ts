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

  // Walks fiber.return up until a named component type is found. Used both for
  // the clicked target and for each DOM ancestor (to label ancestors in the UI).
  function nearestComponentName(fiber: any): string | null {
    let cur = fiber;
    while (cur) {
      const name = getComponentName(cur);
      if (name) return name;
      cur = cur.return;
    }
    return null;
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

  function componentNameForSelector(selector: string): string | null {
    const el = document.querySelector(selector);
    if (!el) return null;
    const key = findFiberKey(el);
    if (!key) return null;
    return nearestComponentName((el as any)[key]);
  }

  function extractBundle(
    selfSelector: string,
    ancestorSelectors: string[],
    queryId: string,
  ) {
    const el = document.querySelector(selfSelector);
    const self = el
      ? extractSelfFiberData(el)
      : { componentName: null, debugSource: null };
    const ancestorComponents = ancestorSelectors.map((sel) =>
      componentNameForSelector(sel),
    );
    return { self, ancestorComponents, queryId };
  }

  scriptEl.addEventListener("inspatch-fiber-query", ((e: CustomEvent) => {
    const { selfSelector, ancestorSelectors, queryId } = e.detail ?? {};
    if (typeof selfSelector !== "string" || typeof queryId !== "string") return;
    const selectors = Array.isArray(ancestorSelectors) ? ancestorSelectors : [];
    const result = extractBundle(selfSelector, selectors, queryId);
    scriptEl.dispatchEvent(new CustomEvent("inspatch-fiber-result", { detail: result }));
  }) as EventListener);
});
