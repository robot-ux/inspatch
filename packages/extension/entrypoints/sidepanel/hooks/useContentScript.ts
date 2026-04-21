import { useCallback, useState } from "react";
import { checkFileUrlPermission, classifyUrl } from "../utils/chrome";

interface UseContentScriptOptions {
  /** Called when a file:// page's permission is re-checked after a failure. */
  onFilePermissionChange?: (allowed: boolean) => void;
}

export interface ContentScriptMessenger {
  sendToContent: (message: { type: string } & Record<string, unknown>) => Promise<unknown>;
  transientError: string | null;
  setTransientError: (value: string | null) => void;
}

/**
 * Sends messages to the active tab's content script. When the content script
 * isn't reachable it sets `transientError` with an actionable hint (and, on
 * file:// pages, re-checks the file-URL permission so the banner reflects the
 * current state if the user just toggled it).
 */
export function useContentScript({
  onFilePermissionChange,
}: UseContentScriptOptions = {}): ContentScriptMessenger {
  const [transientError, setTransientError] = useState<string | null>(null);

  const sendToContent = useCallback(
    async (message: { type: string } & Record<string, unknown>) => {
      setTransientError(null);
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) {
        setTransientError("No active tab found");
        throw new Error("No active tab found");
      }
      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Content script missing has two distinct causes on file:// pages:
        //   1. "Allow access to file URLs" is still off → the banner is showing.
        //   2. Permission is on, but the tab was loaded before Inspatch was last
        //      reloaded or before the permission was flipped on → reload the tab.
        // Re-checking permission here (instead of trusting state) makes the hint
        // accurate even if the user just toggled the switch.
        const kind = classifyUrl(tab.url);
        if (kind === "file") {
          const allowed = await checkFileUrlPermission();
          onFilePermissionChange?.(allowed);
          setTransientError(
            allowed
              ? "Can't reach the page. Reload this tab — Inspatch was reloaded after the tab opened."
              : "Can't reach the page. Enable \"Allow access to file URLs\" (see banner), then reload this tab.",
          );
        } else {
          setTransientError(
            "Content script not loaded — reload this tab (Inspatch was likely reloaded after the tab opened).",
          );
        }
        throw new Error("Content script not available");
      }
    },
    [onFilePermissionChange],
  );

  return { sendToContent, transientError, setTransientError };
}
