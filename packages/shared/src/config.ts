/**
 * Default port for the local Inspatch WebSocket + HTTP server.
 *
 * Used as:
 *  - Server default when `--port` / `INSPATCH_PORT` isn't set
 *  - Extension's hardcoded target (the extension can't receive CLI flags)
 *
 * If a user runs the server on a non-default port they must rebuild the
 * extension with this value overridden, or we'd need a settings UI.
 */
export const DEFAULT_SERVER_PORT = 9377;
