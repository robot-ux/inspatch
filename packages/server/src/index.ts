import { createLogger } from "@inspatch/shared";
import { createServer, SERVER_VERSION } from "./server";

const logger = createLogger("server");

const DEFAULT_PORT = 9377;

function getPort(): number {
  const args = process.argv.slice(2);
  const portFlagIdx = args.indexOf("--port");
  if (portFlagIdx !== -1 && args[portFlagIdx + 1]) {
    const p = parseInt(args[portFlagIdx + 1], 10);
    if (p >= 1 && p <= 65535) return p;
    logger.error(`Invalid port: ${args[portFlagIdx + 1]}. Must be 1-65535.`);
    process.exit(1);
  }

  const envPort = process.env.INSPATCH_PORT;
  if (envPort) {
    const p = parseInt(envPort, 10);
    if (p >= 1 && p <= 65535) return p;
    logger.error(`Invalid INSPATCH_PORT: ${envPort}. Must be 1-65535.`);
    process.exit(1);
  }

  return DEFAULT_PORT;
}

const port = getPort();

try {
  const server = createServer(port);
  logger.info(`Inspatch server v${SERVER_VERSION}`);
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
