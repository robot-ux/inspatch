#!/usr/bin/env bun
import { homedir } from 'os';
import { createLogger, DEFAULT_SERVER_PORT } from '@inspatch/shared';
import {
  createServer,
  detectEditor,
  SERVER_VERSION,
  type EditorScheme,
} from './server';
import { printBanner } from './banner';

const logger = createLogger('server');

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
@inspatch/server v${SERVER_VERSION}

Usage:
  npx @inspatch/server [options]

Inspatch auto-resolves the project for each change based on the inspected
element's source path (walks up to the nearest package.json, never crosses
your home directory). Start it from any directory; multiple projects under
your home directory all share one server.

Options:
  --port <number>          WebSocket port (default: ${DEFAULT_SERVER_PORT})
  --editor <cursor|vscode> Editor to open files in (default: auto-detect)
  --timeout <seconds>      Claude runner timeout in seconds (default: 1800)
  -h, --help               Show this help message

Example:
  npx @inspatch/server
  npx @inspatch/server --editor cursor
  npx @inspatch/server --port 9378 --timeout 3600
`);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

function getCliArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function getPort(): number {
  const raw = getCliArg('--port') ?? process.env.INSPATCH_PORT;
  if (!raw) return DEFAULT_SERVER_PORT;
  const p = parseInt(raw, 10);
  if (p >= 1 && p <= 65535) return p;
  logger.error(`Invalid port: ${raw}. Must be 1-65535.`);
  process.exit(1);
}

async function getEditor(): Promise<{ editor: EditorScheme; autoDetected: boolean }> {
  const raw = getCliArg('--editor');
  if (!raw) return { editor: await detectEditor(), autoDetected: true };
  if (raw === 'cursor' || raw === 'vscode') return { editor: raw, autoDetected: false };
  logger.error(`Invalid editor: "${raw}". Valid options: cursor, vscode`);
  process.exit(1);
}

function getTimeout(): number {
  const raw = getCliArg('--timeout') ?? process.env.INSPATCH_TIMEOUT;
  if (!raw) return 1800;
  const s = parseInt(raw, 10);
  if (Number.isInteger(s) && s > 0) return s;
  logger.error(
    `Invalid timeout: "${raw}". Must be a positive integer (seconds).`,
  );
  process.exit(1);
}

const port = getPort();
const { editor, autoDetected: editorAutoDetected } = await getEditor();
const timeoutMs = getTimeout() * 1000;

const editorLogger = createLogger('editor');

try {
  const { server, shutdown } = createServer(port, editor, timeoutMs);
  const boundPort = server.port ?? port;
  printBanner({
    version: SERVER_VERSION,
    port: boundPort,
    scope: `auto-resolve under ${homedir()}`,
  });
  logger.info(`Listening on ws://127.0.0.1:${boundPort} (timeout ${timeoutMs / 1000}s, Ctrl+C to stop)`);
  editorLogger.info(`Using ${editor} (${editorAutoDetected ? 'auto-detected' : 'from --editor'})`);

  // Cleanly tear down Claude subprocesses on Ctrl-C / SIGTERM. Without this
  // the pool's long-lived Query processes linger past the parent exit.
  const gracefulExit = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    shutdown();
    process.exit(0);
  };
  process.once('SIGINT', () => gracefulExit('SIGINT'));
  process.once('SIGTERM', () => gracefulExit('SIGTERM'));
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes('EADDRINUSE')) {
    logger.error(`Port ${port} is already in use.`);
    logger.error(`Try: lsof -i :${port}`);
    process.exit(1);
  }
  throw err;
}
