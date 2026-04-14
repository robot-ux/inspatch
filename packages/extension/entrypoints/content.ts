import { createOverlayHost, createOverlayLayers } from './content/overlay-manager';
import { InspectMode } from './content/inspect-mode';
import { setupMessageListeners, sendElementSelection } from './content/messaging';

export default defineContentScript({
  matches: ['http://localhost:*/*'],
  main(ctx) {
    console.log('[Inspatch] Content script loaded on', window.location.href);
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
      host.remove();
    });
  },
});
