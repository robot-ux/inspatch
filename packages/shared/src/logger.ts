declare const process: { env: Record<string, string | undefined> } | undefined;

export const LogLevel = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevelName = keyof typeof LogLevel;

function resolveLevel(): number {
  const env =
    typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);

  const override = env.LOG_LEVEL?.toLowerCase() as LogLevelName | undefined;
  if (override && override in LogLevel) return LogLevel[override];

  return env.NODE_ENV === "production" ? LogLevel.info : LogLevel.debug;
}

const currentLevel = resolveLevel();

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;

  return {
    debug: currentLevel <= LogLevel.debug
      ? (...args: unknown[]) => console.debug(prefix, ...args)
      : () => {},
    info: currentLevel <= LogLevel.info
      ? (...args: unknown[]) => console.info(prefix, ...args)
      : () => {},
    warn: currentLevel <= LogLevel.warn
      ? (...args: unknown[]) => console.warn(prefix, ...args)
      : () => {},
    error: currentLevel <= LogLevel.error
      ? (...args: unknown[]) => console.error(prefix, ...args)
      : () => {},
  };
}
