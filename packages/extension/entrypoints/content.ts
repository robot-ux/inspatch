import { createOverlayHost, createOverlayLayers } from './content/overlay-manager';
import { InspectMode } from './content/inspect-mode';
import { setupMessageListeners, sendElementSelection } from './content/messaging';
import { initFiberBridge } from './content/fiber-bridge';
import { clearSourceMapCache } from './content/source-resolver';

export default defineContentScript({
  matches: ['http://localhost:*/*'],
  async main(ctx) {
    console.log('[Inspatch] Content script loaded on', window.location.href);

    try {
      await initFiberBridge();
    } catch {
      console.warn('[Inspatch] Fiber bridge init failed — React detection unavailable');
    }

    const { host, shadow } = createOverlayHost();
    const layers = createOverlayLayers(shadow);

    let lastSelectedElement: Element | null = null;

    const inspectMode = new InspectMode({
      host,
      layers,
      onSelect: (el) => {
        lastSelectedElement = el;
        sendElementSelection(el);
      },
    });

    const cleanupMessaging = setupMessageListeners(
      inspectMode,
      () => lastSelectedElement,
    );

    ctx.onInvalidated(() => {
      inspectMode.stop();
      cleanupMessaging();
      clearSourceMapCache();
      host.remove();
    });
  },
});
