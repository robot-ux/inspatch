import { createOverlayHost, createOverlayLayers } from './content/overlay-manager';
import { InspectMode } from './content/inspect-mode';
import { setupMessageListeners, sendElementSelection } from './content/messaging';

export default defineContentScript({
  matches: ['http://localhost:*/*'],
  main(ctx) {
    const { host, shadow } = createOverlayHost();
    const layers = createOverlayLayers(shadow);

    const inspectMode = new InspectMode({
      host,
      layers,
      onSelect: (el) => sendElementSelection(el),
    });

    const cleanupMessaging = setupMessageListeners(inspectMode);

    ctx.onInvalidated(() => {
      inspectMode.stop();
      cleanupMessaging();
      host.remove();
    });
  },
});
