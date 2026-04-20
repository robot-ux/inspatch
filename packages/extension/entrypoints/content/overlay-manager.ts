import { calculateBoxModel } from './box-model';

export interface OverlayLayers {
  margin: HTMLElement;
  border: HTMLElement;
  padding: HTMLElement;
  content: HTMLElement;
  tooltip: HTMLElement;
}

const OVERLAY_STYLES = `
:host { all: initial; pointer-events: none; }
.layer { position: absolute; pointer-events: none; }
.margin-layer { background: rgba(255, 155, 0, 0.3); }
.border-layer { background: rgba(255, 200, 50, 0.3); }
.padding-layer { background: rgba(120, 200, 80, 0.3); }
.content-layer { background: rgba(100, 150, 255, 0.3); }
.tooltip {
  position: absolute;
  background: #0e0e10;
  color: #ededed;
  font: 500 11px/1.3 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  padding: 3px 7px;
  border-radius: 3px;
  border: 1px solid rgba(96, 99, 238, 0.35);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
  pointer-events: none;
}
`;

export function createOverlayHost(): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement('inspatch-overlay');
  host.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = OVERLAY_STYLES;
  shadow.appendChild(style);

  return { host, shadow };
}

export function createOverlayLayers(shadow: ShadowRoot): OverlayLayers {
  const margin = document.createElement('div');
  margin.className = 'layer margin-layer';

  const border = document.createElement('div');
  border.className = 'layer border-layer';

  const padding = document.createElement('div');
  padding.className = 'layer padding-layer';

  const content = document.createElement('div');
  content.className = 'layer content-layer';

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';

  shadow.append(margin, border, padding, content, tooltip);

  return { margin, border, padding, content, tooltip };
}

function setRect(
  el: HTMLElement,
  rect: { top: number; left: number; width: number; height: number },
) {
  el.style.top = `${rect.top}px`;
  el.style.left = `${rect.left}px`;
  el.style.width = `${Math.max(0, rect.width)}px`;
  el.style.height = `${Math.max(0, rect.height)}px`;
}

export function positionOverlayLayers(el: Element, layers: OverlayLayers) {
  const rect = el.getBoundingClientRect();
  const box = calculateBoxModel(el);

  setRect(layers.margin, {
    top: rect.top - box.margin.top,
    left: rect.left - box.margin.left,
    width: rect.width + box.margin.left + box.margin.right,
    height: rect.height + box.margin.top + box.margin.bottom,
  });

  setRect(layers.border, {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  });

  setRect(layers.padding, {
    top: rect.top + box.border.top,
    left: rect.left + box.border.left,
    width: rect.width - box.border.left - box.border.right,
    height: rect.height - box.border.top - box.border.bottom,
  });

  setRect(layers.content, {
    top: rect.top + box.border.top + box.padding.top,
    left: rect.left + box.border.left + box.padding.left,
    width:
      rect.width -
      box.border.left -
      box.border.right -
      box.padding.left -
      box.padding.right,
    height:
      rect.height -
      box.border.top -
      box.border.bottom -
      box.padding.top -
      box.padding.bottom,
  });

  const tooltipY = rect.top - box.margin.top - 24;
  const flippedY = tooltipY < 4 ? rect.bottom + box.margin.bottom + 4 : tooltipY;
  layers.tooltip.style.top = `${flippedY}px`;
  layers.tooltip.style.left = `${rect.left - box.margin.left}px`;
  layers.tooltip.textContent = `${el.tagName.toLowerCase()} \u00b7 ${Math.round(rect.width)}\u00d7${Math.round(rect.height)}`;
}

export function mountOverlay(host: HTMLElement) {
  document.body.appendChild(host);
}

export function unmountOverlay(host: HTMLElement) {
  host.remove();
}

export function showLayers(layers: OverlayLayers) {
  for (const el of Object.values(layers)) {
    (el as HTMLElement).style.display = '';
  }
}

export function hideLayers(layers: OverlayLayers) {
  for (const el of Object.values(layers)) {
    (el as HTMLElement).style.display = 'none';
  }
}
