import { resolve } from "path";
import { existsSync } from "fs";
import { createLogger } from "@inspatch/shared";
import { createServer, SERVER_VERSION } from "./server";

const logger = createLogger("server");

const DEFAULT_PORT = 9377;

function getCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function getPort(): number {
  const raw = getCliArg("--port") ?? process.env.INSPATCH_PORT;
  if (!raw) return DEFAULT_PORT;
  const p = parseInt(raw, 10);
  if (p >= 1 && p <= 65535) return p;
  logger.error(`Invalid port: ${raw}. Must be 1-65535.`);
  process.exit(1);
}

function getProjectDir(): string {
  const raw = getCliArg("--project") ?? process.env.INSPATCH_PROJECT_DIR;
  if (!raw) {
    logger.error("Project directory required. Use --project /path/to/app or set INSPATCH_PROJECT_DIR");
    process.exit(1);
  }
  const dir = resolve(raw);
  if (!existsSync(dir)) {
    logger.error(`Project directory does not exist: ${dir}`);
    process.exit(1);
  }
  return dir;
}

const port = getPort();
const projectDir = getProjectDir();

try {
  const server = createServer(port, projectDir);
  logger.info(`Inspatch server v${SERVER_VERSION}`);
  logger.info(`Project: ${projectDir}`);
  logger.info(`Listening on ws://127.0.0.1:${server.port}`);
  logger.info("Press Ctrl+C to stop");
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes("EADDRINUSE")) {
    logger.error(`Port ${port} is already in use.`);
    logger.error(`Try: lsof -i :${port}`);
    process.exit(1);
  }
  throw err;
}
