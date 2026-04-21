export type UrlKind = "localhost" | "file" | "other";

// Supported URLs: localhost (any port) and local HTML files under file://.
// Non-html file:// URLs (pdf, txt, binary, directory listing) fall through
// to "other" — Inspatch has no source to edit for those.
export function classifyUrl(url: string | undefined): UrlKind {
  if (!url) return "other";
  try {
    const u = new URL(url);
    if (u.protocol === "file:") {
      const path = u.pathname.toLowerCase();
      return path.endsWith(".html") || path.endsWith(".htm") ? "file" : "other";
    }
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]") {
      return "localhost";
    }
    return "other";
  } catch {
    return "other";
  }
}

// Chrome-internal / extension / devtools URLs that briefly steal focus (e.g. a
// wallet extension's approval popup) should NOT overwrite the side panel's
// last-known real tab state. Treat them as transient and ignore the activation.
const TRANSIENT_PROTOCOLS = new Set([
  "chrome:",
  "chrome-extension:",
  "chrome-search:",
  "chrome-devtools:",
  "devtools:",
  "moz-extension:",
  "edge:",
  "brave:",
  "about:",
]);

export function isTransientUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return TRANSIENT_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * chrome.extension.isAllowedFileSchemeAccess is still supported in MV3 and is
 * the only reliable way to detect whether the user has toggled "Allow access
 * to file URLs" on for this extension. Returns `true` when the API is missing
 * so non-file contexts aren't incorrectly flagged as blocked.
 */
export async function checkFileUrlPermission(): Promise<boolean> {
  const api = (chrome as unknown as {
    extension?: { isAllowedFileSchemeAccess?: () => Promise<boolean> };
  }).extension;
  if (!api?.isAllowedFileSchemeAccess) return true;
  try {
    return await api.isAllowedFileSchemeAccess();
  } catch {
    return true;
  }
}
