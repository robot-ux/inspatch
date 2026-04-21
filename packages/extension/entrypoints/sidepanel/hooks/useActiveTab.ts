import { useEffect, useRef, useState } from "react";
import {
  checkFileUrlPermission,
  classifyUrl,
  isTransientUrl,
  type UrlKind,
} from "../utils/chrome";

interface UseActiveTabOptions {
  /** Fired after every readTab with the latest tab info (same-tab updates too). */
  onRead?: (tab: chrome.tabs.Tab, kind: UrlKind) => void;
  /** Fired only on real tab switches (chrome.tabs.onActivated). */
  onSwitch?: (tabId: number) => void;
}

export interface ActiveTabInfo {
  activeTabId: number | null;
  /** Ref mirror for synchronous reads from event handlers. */
  activeTabIdRef: React.RefObject<number | null>;
  currentTabUrl: string | undefined;
  urlKind: UrlKind;
  fileUrlPermission: boolean;
  /** Imperatively refresh fileUrlPermission — used when a sendToContent fails. */
  setFileUrlPermission: (allowed: boolean) => void;
}

/**
 * Tracks the currently active browser tab's URL, classification, and
 * file-URL permission. Listens to `chrome.tabs.onActivated` / `onUpdated`
 * so switching tabs or reloading the active one keeps state in sync.
 */
export function useActiveTab({ onRead, onSwitch }: UseActiveTabOptions = {}): ActiveTabInfo {
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [currentTabUrl, setCurrentTabUrl] = useState<string | undefined>(undefined);
  const [urlKind, setUrlKind] = useState<UrlKind>("localhost");
  const [fileUrlPermission, setFileUrlPermission] = useState(true);

  const activeTabIdRef = useRef<number | null>(null);
  // The side panel runs inside a specific browser window. When a wallet
  // extension opens its own popup window to request a signature, Chrome fires
  // `tabs.onActivated` for the new window's tab — but the side panel's window
  // never changed. Filtering by this id ignores those foreign-window events.
  const panelWindowIdRef = useRef<number | null>(null);

  // Latest callbacks in refs so the effect doesn't tear down on every render.
  const onReadRef = useRef(onRead);
  const onSwitchRef = useRef(onSwitch);
  onReadRef.current = onRead;
  onSwitchRef.current = onSwitch;

  useEffect(() => {
    const setActive = (id: number | null) => {
      activeTabIdRef.current = id;
      setActiveTabId(id);
    };

    const readTab = async (tabId?: number) => {
      let tab: chrome.tabs.Tab | undefined;
      if (tabId !== undefined) {
        try {
          tab = await chrome.tabs.get(tabId);
        } catch {
          return;
        }
      } else {
        // `currentWindow: true` binds the query to the side panel's host
        // window, so a wallet popup window stealing focus at mount time
        // doesn't leak its tab into our initial state.
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = t;
      }
      if (!tab) return;

      // Same-window navigation to an extension / chrome:// URL (rare) — keep
      // last real state instead of switching to the blocked screen.
      if (isTransientUrl(tab.url)) return;

      if (tab.id !== undefined) setActive(tab.id);
      setCurrentTabUrl(tab.url);

      const kind = classifyUrl(tab.url);
      setUrlKind(kind);

      // file:// pages require the "Allow access to file URLs" toggle.
      // Re-check every tab switch so the banner clears the moment the user flips it on.
      if (kind === "file") {
        setFileUrlPermission(await checkFileUrlPermission());
      } else {
        setFileUrlPermission(true);
      }

      onReadRef.current?.(tab, kind);
    };

    // Capture the side panel's host window id, then do the initial tab read.
    // Both are async; the order doesn't matter because `onActivated` below
    // falls back to "allow" when the id isn't known yet (initial paint).
    chrome.windows
      .getCurrent()
      .then((w) => {
        if (w.id !== undefined) panelWindowIdRef.current = w.id;
      })
      .catch(() => {
        /* leave null — window filter becomes a no-op */
      });

    readTab();

    const onActivated = ({ tabId, windowId }: { tabId: number; windowId: number }) => {
      const panelWindowId = panelWindowIdRef.current;
      if (panelWindowId !== null && windowId !== panelWindowId) return;
      setActive(tabId);
      onSwitchRef.current?.(tabId);
      readTab(tabId);
    };
    const onUpdated = (tabId: number, info: { url?: string; status?: string }) => {
      if (tabId !== activeTabIdRef.current) return;
      if (info.url !== undefined && isTransientUrl(info.url)) return;
      if (info.url !== undefined || info.status === "complete") readTab(tabId);
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return {
    activeTabId,
    activeTabIdRef,
    currentTabUrl,
    urlKind,
    fileUrlPermission,
    setFileUrlPermission,
  };
}
