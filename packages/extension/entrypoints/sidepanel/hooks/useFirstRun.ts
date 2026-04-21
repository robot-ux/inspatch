import { useCallback, useEffect, useState } from "react";

const KEY_OPENED = "inspatch:hasOpenedBefore";
const KEY_LAST_URL = "inspatch:lastSupportedUrl";

export interface FirstRunState {
  ready: boolean;
  hasOpenedBefore: boolean;
  lastSupportedUrl: string | undefined;
  markOpenedWithSupported: (url: string) => void;
}

export function useFirstRun(): FirstRunState {
  const [ready, setReady] = useState(false);
  const [hasOpenedBefore, setHasOpenedBefore] = useState(false);
  const [lastSupportedUrl, setLastSupportedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    chrome.storage?.local
      ?.get([KEY_OPENED, KEY_LAST_URL])
      .then((record) => {
        if (cancelled) return;
        setHasOpenedBefore(Boolean(record[KEY_OPENED]));
        const url = record[KEY_LAST_URL];
        setLastSupportedUrl(typeof url === "string" ? url : undefined);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markOpenedWithSupported = useCallback((url: string) => {
    setHasOpenedBefore(true);
    setLastSupportedUrl(url);
    chrome.storage?.local
      ?.set({ [KEY_OPENED]: true, [KEY_LAST_URL]: url })
      .catch(() => {});
  }, []);

  return { ready, hasOpenedBefore, lastSupportedUrl, markOpenedWithSupported };
}
