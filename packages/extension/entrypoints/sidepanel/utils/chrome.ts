export type UrlKind = "localhost" | "file" | "other";

export function classifyUrl(url: string | undefined): UrlKind {
  if (!url) return "other";
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return "file";
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]") {
      return "localhost";
    }
    return "other";
  } catch {
    return "other";
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
