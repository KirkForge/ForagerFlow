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

let telemetryEnabled = true;

/** Enable or disable telemetry recording without unregistering handlers. */
export function setTelemetryEnabled(enabled: boolean): void {
  telemetryEnabled = enabled;
}

export function recordTelemetry(
  name: string,
  data: Record<string, unknown> = {},
): void {
  if (!telemetryEnabled) return;

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

/** Factory for a handler that POSTs telemetry events via navigator.sendBeacon. */
function isBeaconSupported(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "navigator" in globalThis &&
    typeof globalThis.navigator.sendBeacon === "function"
  );
}

export function createBeaconTelemetryHandler(
  endpoint: string,
): TelemetryHandler {
  return (event: TelemetryEvent) => {
    if (!isBeaconSupported()) return;
    try {
      const blob = new Blob([JSON.stringify(event)], {
        type: "application/json",
      });
      globalThis.navigator.sendBeacon(endpoint, blob);
    } catch (err) {
      logger.warn("Beacon telemetry send failed:", err);
    }
  };
}

const LOCAL_STORAGE_KEY = "foragerflow.telemetry.buffer";

interface BufferedTelemetry {
  events: TelemetryEvent[];
}

/** Factory for a handler that buffers the most recent telemetry events in localStorage. */
export function createLocalStorageTelemetryHandler(
  maxEvents = 250,
): TelemetryHandler {
  return (event: TelemetryEvent) => {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const buffer: BufferedTelemetry = raw
        ? (JSON.parse(raw) as BufferedTelemetry)
        : { events: [] };
      buffer.events.push(event);
      if (buffer.events.length > maxEvents) {
        buffer.events = buffer.events.slice(-maxEvents);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(buffer));
    } catch (err) {
      if (err instanceof Error && err.name === "QuotaExceededError") {
        logger.warn("Telemetry localStorage quota exceeded; dropping event");
      } else {
        logger.warn("Telemetry localStorage write failed:", err);
      }
    }
  };
}

/** Factory for a handler that logs telemetry events to the console. Useful in dev. */
export function createConsoleTelemetryHandler(): TelemetryHandler {
  return (event: TelemetryEvent) => {
    logger.info("[telemetry]", event.name, event);
  };
}

/** Read the buffered telemetry events persisted by the localStorage handler. */
export function readBufferedTelemetry(): TelemetryEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BufferedTelemetry;
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

/** Clear the buffered telemetry events persisted by the localStorage handler. */
export function clearBufferedTelemetry(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (err) {
    logger.warn("Telemetry localStorage clear failed:", err);
  }
}
