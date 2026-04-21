import { DEFAULT_SERVER_PORT } from "@inspatch/shared";

export const SERVER_PORT = DEFAULT_SERVER_PORT;
export const SERVER_WS = `ws://localhost:${SERVER_PORT}`;
export const SERVER_HTTP = `http://localhost:${SERVER_PORT}`;
/** Human-facing endpoint string, e.g. rendered in the footer. */
export const SERVER_ENDPOINT_DISPLAY = `ws://127.0.0.1:${SERVER_PORT}`;

/** chrome.storage.local key for a tab's in-flight request, used for WS resume. */
export const pendingKey = (tabId: number) => `pending_${tabId}`;

/**
 * Fresh v4 UUID used as the conversation key on the server. A new id is
 * minted on the first change_request of a tab, reset on page reload, URL
 * change, or "New conversation" — each id maps 1:1 to a long-lived Claude
 * session on the server.
 */
export function newConversationId(): string {
  return crypto.randomUUID();
}

/** Ask the local server to open a file in the user's editor. Fire-and-forget. */
export function openInEditor(file: string, line?: number, column?: number) {
  const params = new URLSearchParams({ file });
  if (line) params.set("line", String(line));
  if (column) params.set("column", String(column));
  fetch(`${SERVER_HTTP}/open-in-editor?${params}`).catch(() => {});
}
