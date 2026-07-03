type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const APP = "foragerflow";

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    });
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

class Logger {
  private level: LogLevel = import.meta.env.PROD ? "warn" : "debug";

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  // ponytail: PROD emits one JSON line per call (unlocks log pipelines);
  // dev keeps the readable [FORAGERFLOW] prefix. No new dependency.
  private emit(level: LogLevel, args: unknown[]): void {
    if (import.meta.env.PROD) {
      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level,
        app: APP,
        v: 1,
        msg: typeof args[0] === "string" ? args[0] : safeStringify(args[0]),
      };
      if (args.length > 1) {
        entry["fields"] = args.slice(1).map(safeStringify);
      }
      const fn = (
        console as unknown as Record<LogLevel, (...a: unknown[]) => void>
      )[level];
      fn(JSON.stringify(entry));
    } else {
      const fn = (
        console as unknown as Record<LogLevel, (...a: unknown[]) => void>
      )[level];
      fn("[FORAGERFLOW]", ...args);
    }
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog("debug")) this.emit("debug", args);
  }

  info(...args: unknown[]): void {
    if (this.shouldLog("info")) this.emit("info", args);
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog("warn")) this.emit("warn", args);
  }

  error(...args: unknown[]): void {
    if (this.shouldLog("error")) this.emit("error", args);
  }
}

export const logger = new Logger();