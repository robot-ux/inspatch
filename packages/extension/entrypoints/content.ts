import { createLogger } from '@inspatch/shared';
import { createOverlayHost, createOverlayLayers } from './content/overlay-manager';
import { InspectMode } from './content/inspect-mode';
import { setupMessageListeners, sendElementSelection } from './content/messaging';
import { initFiberBridge } from './content/fiber-bridge';
import { clearSourceMapCache } from './content/source-resolver';

const logger = createLogger('content');

export default defineContentScript({
  matches: ['http://localhost/*'],
  main(ctx) {
    logger.debug('Content script loaded on', location.href);

    initFiberBridge().catch(() => {});

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
      logger.debug('Content script invalidated');
      inspectMode.stop();
      cleanupMessaging();
      clearSourceMapCache();
      host.remove();
    });
  },
});
