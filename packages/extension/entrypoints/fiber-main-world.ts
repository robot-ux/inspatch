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

  function walkFiberTree(startFiber: any) {
    let componentName: string | null = null;
    const parentChain: string[] = [];
    // startFiber._debugSource points to where this exact JSX node is written —
    // the most precise location for editing. Component fibers higher up the tree
    // have _debugSource pointing to their instantiation site (e.g. App.tsx:20 for
    // <Button />) rather than the element itself (e.g. Button.tsx:12 for <span>).
    let debugSource: { fileName: string; lineNumber: number } | null =
      startFiber._debugSource ?? null;

    let fiber = startFiber;
    while (fiber) {
      const name = getComponentName(fiber);
      if (name) {
        if (componentName === null) {
          componentName = name;
          // Only fall back if the element had no debug source of its own
          if (!debugSource) debugSource = fiber._debugSource ?? null;
        }
        parentChain.push(name);
      }
      fiber = fiber.return;
    }

    return { componentName, parentChain, debugSource };
  }

  function extractFiberData(selector: string, queryId: string) {
    const el = document.querySelector(selector);
    if (!el) {
      return { componentName: null, parentChain: [], debugSource: null, queryId };
    }

    let fiberKey: string | null = null;
    let target: Element | null = el;

    while (target && !fiberKey) {
      for (const key of Object.keys(target)) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
          fiberKey = key;
          break;
        }
      }
      if (!fiberKey) target = target.parentElement;
    }

    if (!fiberKey || !target) {
      return { componentName: null, parentChain: [], debugSource: null, queryId };
    }

    const result = walkFiberTree((target as any)[fiberKey]);
    return { ...result, queryId };
  }

  scriptEl.addEventListener("inspatch-fiber-query", ((e: CustomEvent) => {
    const { selector, queryId } = e.detail;
    const result = extractFiberData(selector, queryId);
    scriptEl.dispatchEvent(new CustomEvent("inspatch-fiber-result", { detail: result }));
  }) as EventListener);
});
