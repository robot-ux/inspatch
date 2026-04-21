import { useEffect, useRef, useState } from "react";
import { checkFileUrlPermission, classifyUrl, type UrlKind } from "../utils/chrome";

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
        const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = t;
      }
      if (!tab) return;

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

    readTab();

    const onActivated = ({ tabId }: { tabId: number }) => {
      setActive(tabId);
      onSwitchRef.current?.(tabId);
      readTab(tabId);
    };
    const onUpdated = (tabId: number, info: { url?: string; status?: string }) => {
      if (tabId !== activeTabIdRef.current) return;
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
