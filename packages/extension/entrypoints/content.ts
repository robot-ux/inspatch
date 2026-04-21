import { createLogger } from '@inspatch/shared';
import { createOverlayHost, createOverlayLayers } from './content/overlay-manager';
import { InspectMode } from './content/inspect-mode';
import { setupMessageListeners, sendElementSelection, setOverlayHost } from './content/messaging';
import { initFiberBridge } from './content/fiber-bridge';
import { initConsoleBridge } from './content/console-bridge';
import { clearSourceMapCache } from './content/source-resolver';

const logger = createLogger('content');

export default defineContentScript({
  // Match both localhost (React dev servers) and file:// pages (hand-edited HTML).
  // Fiber / console bridges only run on localhost — see isFileUrl branching below.
  matches: ['http://localhost/*', 'file:///*'],
  main(ctx) {
    logger.debug('Content script loaded on', location.href);

    const isFileUrl = location.protocol === 'file:';

    let cleanupConsole: (() => void) | null = null;
    if (!isFileUrl) {
      initFiberBridge().catch(() => {});
      cleanupConsole = initConsoleBridge();
    } else {
      logger.debug('file:// page — DOM-only mode (Fiber/console bridges disabled)');
    }

    const { host, shadow } = createOverlayHost();
    const layers = createOverlayLayers(shadow);
    // Share host reference with messaging.ts so DOM walks (ancestor / descendant
    // collection) can skip the inspect overlay and never emit it into the tree.
    setOverlayHost(host);

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
      cleanupConsole?.();
      clearSourceMapCache();
      host.remove();
    });
  },
});
