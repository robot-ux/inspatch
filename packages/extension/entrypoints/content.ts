import { createOverlayHost, createOverlayLayers } from './content/overlay-manager';
import { InspectMode } from './content/inspect-mode';
import { setupMessageListeners, sendElementSelection } from './content/messaging';
import { initFiberBridge } from './content/fiber-bridge';
import { clearSourceMapCache } from './content/source-resolver';

export default defineContentScript({
  matches: ['http://localhost:*/*'],
  main(ctx) {
    console.log('[Inspatch] Content script loaded on', window.location.href);

    console.log('[Inspatch] Starting fiber bridge init...');
    initFiberBridge().then(() => {
      console.log('[Inspatch] Fiber bridge init done, bridgeReady:', true);
    }).catch((err) => {
      console.warn('[Inspatch] Fiber bridge init error:', err);
    });

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
