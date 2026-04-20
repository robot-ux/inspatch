#!/usr/bin/env bun
import { resolve, dirname } from 'path';
import { existsSync, statSync } from 'fs';
import { createLogger } from '@inspatch/shared';
import {
  createServer,
  detectEditor,
  SERVER_VERSION,
  type EditorScheme,
} from './server';

const logger = createLogger('server');

const DEFAULT_PORT = 9377;
const args = process.argv.slice(2);

function printHelp() {
  console.log(`
@inspatch/server v${SERVER_VERSION}

Usage:
  npx @inspatch/server <dir> [options]

Options:
  -p, --project <path>     Target project directory, or path to an HTML file
                           (the file's parent directory becomes the project root)
  --port <number>          WebSocket port (default: ${DEFAULT_PORT})
  --editor <cursor|vscode> Editor to open files in (default: auto-detect)
  --timeout <seconds>      Claude runner timeout in seconds (default: 1800)
  -h, --help               Show this help message

Example:
  npx @inspatch/server .
  npx @inspatch/server ./my-react-app
  npx @inspatch/server ./static-site/index.html
  npx @inspatch/server /Users/me/app --editor cursor
  npx @inspatch/server /Users/me/app --timeout 3600
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

function getPositionalArg(): string | undefined {
  const flagsWithValues = ['--project', '-p', '--port', '--editor', '--timeout'];
  const consumed = new Set<number>();
  for (const flag of flagsWithValues) {
    const idx = args.indexOf(flag);
    if (idx !== -1) {
      consumed.add(idx);
      consumed.add(idx + 1);
    }
  }
  return args.find((arg, i) => !consumed.has(i) && !arg.startsWith('-'));
}

function getPort(): number {
  const raw = getCliArg('--port') ?? process.env.INSPATCH_PORT;
  if (!raw) return DEFAULT_PORT;
  const p = parseInt(raw, 10);
  if (p >= 1 && p <= 65535) return p;
  logger.error(`Invalid port: ${raw}. Must be 1-65535.`);
  process.exit(1);
}

function getProjectDir(): string {
  const raw = getCliArg('--project') ?? getCliArg('-p') ?? getPositionalArg();
  if (!raw) {
    printHelp();
    process.exit(0);
  }
  const target = resolve(raw);
  if (!existsSync(target)) {
    logger.error(`Project path does not exist: ${target}`);
    process.exit(1);
  }
  const stat = statSync(target);
  if (stat.isFile()) {
    if (!/\.html?$/i.test(target)) {
      logger.error(`Only .html/.htm files are accepted as a file target. Got: ${target}`);
      process.exit(1);
    }
    const parent = dirname(target);
    logger.info(`HTML file target — using parent directory as project: ${parent}`);
    return parent;
  }
  if (!stat.isDirectory()) {
    logger.error(`Project path must be a directory or an .html file: ${target}`);
    process.exit(1);
  }
  return target;
}

function getEditor(): Promise<EditorScheme> {
  const raw = getCliArg('--editor');
  if (!raw) return detectEditor();
  if (raw === 'cursor' || raw === 'vscode') return Promise.resolve(raw);
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
const projectDir = getProjectDir();
const editor = await getEditor();
const timeoutMs = getTimeout() * 1000;

try {
  const server = createServer(port, projectDir, editor, timeoutMs);
  logger.info(`Inspatch server v${SERVER_VERSION}`);
  logger.info(`Project: ${projectDir}`);
  logger.info(`Editor:  ${editor}`);
  logger.info(`Timeout: ${timeoutMs / 1000}s`);
  logger.info(`Listening on ws://127.0.0.1:${server.port}`);
  logger.info('Press Ctrl+C to stop');
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes('EADDRINUSE')) {
    logger.error(`Port ${port} is already in use.`);
    logger.error(`Try: lsof -i :${port}`);
    process.exit(1);
  }
  throw err;
}
