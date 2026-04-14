export function getElementAtPoint(
  x: number,
  y: number,
  overlayHost: HTMLElement,
): Element | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el === overlayHost || overlayHost.contains(el)) return null;
  return el;
}

export function getXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    const tagName = current.tagName.toLowerCase();
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }

  return '/' + parts.join('/');
}
