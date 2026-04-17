import { useCallback, useEffect, useState } from "react";

const KEY_OPENED = "inspatch:hasOpenedBefore";
const KEY_LAST_LOCALHOST = "inspatch:lastLocalhostUrl";

export interface FirstRunState {
  ready: boolean;
  hasOpenedBefore: boolean;
  lastLocalhostUrl: string | undefined;
  markOpenedWithLocalhost: (url: string) => void;
}

export function useFirstRun(): FirstRunState {
  const [ready, setReady] = useState(false);
  const [hasOpenedBefore, setHasOpenedBefore] = useState(false);
  const [lastLocalhostUrl, setLastLocalhostUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    chrome.storage?.local
      ?.get([KEY_OPENED, KEY_LAST_LOCALHOST])
      .then((record) => {
        if (cancelled) return;
        setHasOpenedBefore(Boolean(record[KEY_OPENED]));
        const url = record[KEY_LAST_LOCALHOST];
        setLastLocalhostUrl(typeof url === "string" ? url : undefined);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markOpenedWithLocalhost = useCallback((url: string) => {
    setHasOpenedBefore(true);
    setLastLocalhostUrl(url);
    chrome.storage?.local
      ?.set({ [KEY_OPENED]: true, [KEY_LAST_LOCALHOST]: url })
      .catch(() => {});
  }, []);

  return { ready, hasOpenedBefore, lastLocalhostUrl, markOpenedWithLocalhost };
}
