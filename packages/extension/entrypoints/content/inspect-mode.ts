import type { OverlayLayers } from './overlay-manager';
import {
  positionOverlayLayers,
  mountOverlay,
  unmountOverlay,
  showLayers,
  hideLayers,
} from './overlay-manager';
import { getElementAtPoint } from './element-detector';

export type InspectState = 'idle' | 'inspecting' | 'selected';

export interface InspectModeOptions {
  host: HTMLElement;
  layers: OverlayLayers;
  onSelect: (el: Element) => void;
}

export class InspectMode {
  private state: InspectState = 'idle';
  private currentTarget: Element | null = null;
  private selectedElement: Element | null = null;
  private rafId: number | null = null;
  private readonly host: HTMLElement;
  private readonly layers: OverlayLayers;
  private readonly onSelectCb: (el: Element) => void;
  private boundHandlers = {
    mousemove: null as ((e: MouseEvent) => void) | null,
    click: null as ((e: MouseEvent) => void) | null,
    keydown: null as ((e: KeyboardEvent) => void) | null,
  };

  constructor(opts: InspectModeOptions) {
    this.host = opts.host;
    this.layers = opts.layers;
    this.onSelectCb = opts.onSelect;
  }

  start() {
    if (this.state !== 'idle') return;
    this.state = 'inspecting';
    mountOverlay(this.host);
    showLayers(this.layers);

    this.boundHandlers.mousemove = this.handleMouseMove.bind(this);
    this.boundHandlers.click = this.handleClick.bind(this);
    this.boundHandlers.keydown = this.handleKeyDown.bind(this);

    document.addEventListener('mousemove', this.boundHandlers.mousemove, true);
    document.addEventListener('click', this.boundHandlers.click, true);
    document.addEventListener('keydown', this.boundHandlers.keydown, true);

    this.startRafLoop();
  }

  stop() {
    this.state = 'idle';
    this.stopRafLoop();
    hideLayers(this.layers);
    unmountOverlay(this.host);

    if (this.boundHandlers.mousemove) {
      document.removeEventListener('mousemove', this.boundHandlers.mousemove, true);
    }
    if (this.boundHandlers.click) {
      document.removeEventListener('click', this.boundHandlers.click, true);
    }
    if (this.boundHandlers.keydown) {
      document.removeEventListener('keydown', this.boundHandlers.keydown, true);
    }

    this.currentTarget = null;
    this.selectedElement = null;

    chrome.runtime.sendMessage({ type: 'inspect-stopped' }).catch(() => {});
  }

  getSelectedElement(): Element | null {
    return this.selectedElement;
  }

  getState(): InspectState {
    return this.state;
  }

  private handleMouseMove(e: MouseEvent) {
    const target = getElementAtPoint(e.clientX, e.clientY, this.host);
    if (!target || target === this.currentTarget) return;
    this.currentTarget = target;
    positionOverlayLayers(target, this.layers);
  }

  highlightElement(el: Element) {
    mountOverlay(this.host);
    showLayers(this.layers);
    positionOverlayLayers(el, this.layers);
  }

  clearHighlight() {
    hideLayers(this.layers);
    unmountOverlay(this.host);
  }

  private handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!this.currentTarget) return;

    this.selectedElement = this.currentTarget;
    this.onSelectCb(this.selectedElement);
    this.stop();
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.stop();
    }
  }

  private startRafLoop() {
    const loop = () => {
      if (this.state === 'idle') return;
      if (this.currentTarget) {
        positionOverlayLayers(this.currentTarget, this.layers);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopRafLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
