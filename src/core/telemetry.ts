import { logger } from "./logger";

export interface TelemetryEvent {
  name: string;
  timestamp: string;
  data: Record<string, unknown>;
}

type TelemetryHandler = (event: TelemetryEvent) => void;

const handlers = new Set<TelemetryHandler>();

export function addTelemetryHandler(handler: TelemetryHandler): void {
  handlers.add(handler);
}

export function removeTelemetryHandler(handler: TelemetryHandler): void {
  handlers.delete(handler);
}

export function recordTelemetry(
  name: string,
  data: Record<string, unknown> = {},
): void {
  const event: TelemetryEvent = {
    name,
    timestamp: new Date().toISOString(),
    data,
  };
  logger.debug(`Telemetry: ${name}`, data);
  for (const handler of handlers) {
    try {
      handler(event);
    } catch (err) {
      logger.error("Telemetry handler error:", err);
    }
  }
}

/** Measure duration of an async operation and record it as a telemetry event. */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  data?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    recordTelemetry(`${name}.success`, { durationMs: duration, ...data });
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    recordTelemetry(`${name}.error`, {
      durationMs: duration,
      error: err instanceof Error ? err.message : String(err),
      ...data,
    });
    throw err;
  }
}

/** Measure duration of a sync operation and record it as a telemetry event. */
export function measureSync<T>(
  name: string,
  fn: () => T,
  data?: Record<string, unknown>,
): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    recordTelemetry(`${name}.success`, { durationMs: duration, ...data });
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    recordTelemetry(`${name}.error`, {
      durationMs: duration,
      error: err instanceof Error ? err.message : String(err),
      ...data,
    });
    throw err;
  }
}
