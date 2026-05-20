type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = import.meta.env.PROD ? "warn" : "debug";

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[FORAGERFLOW]", ...args);
      }
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog("info")) {
      // eslint-disable-next-line no-console
      console.info("[FORAGERFLOW]", ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn("[FORAGERFLOW]", ...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error("[FORAGERFLOW]", ...args);
    }
  }
}

export const logger = new Logger();
