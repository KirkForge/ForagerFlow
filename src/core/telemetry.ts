import { logger } from "./logger";
import { config } from "./config";

export interface TelemetryEvent {
  name: string;
  timestamp: string;
  data: Record<string, unknown>;
}

let telemetryEnabled = config.features.telemetry;

export function setTelemetryEnabled(enabled: boolean): void {
  telemetryEnabled = enabled;
}

function isBeaconSupported(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "navigator" in globalThis &&
    typeof globalThis.navigator.sendBeacon === "function"
  );
}

const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_LENGTH = 32;
const MAX_OBJECT_DEPTH = 3;
const REDACTED = "[REDACTED]";

const KNOWN_EVENTS: Record<string, string[]> = {
  "web-vital": ["name", "value", "rating", "delta", "navigationType"],
};

function looksLikeSensitive(value: string): boolean {
  // Data URLs and geo coordinates.
  return (
    value.startsWith("data:") || /^-?\d{1,3}\.\d+,-?\d{1,3}\.\d+/.test(value)
  );
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > MAX_OBJECT_DEPTH) return REDACTED;

  switch (typeof value) {
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : null;
    case "string":
      return looksLikeSensitive(value)
        ? REDACTED
        : value.slice(0, MAX_STRING_LENGTH);
    case "object":
      if (value === null) return null;
      if (Array.isArray(value)) {
        return value
          .slice(0, MAX_ARRAY_LENGTH)
          .map((item) => scrubValue(item, depth + 1));
      }
      return scrubRecord(value as Record<string, unknown>, depth + 1);
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
    default:
      return REDACTED;
  }
}

function scrubRecord(
  data: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Drop keys that look like they could carry PII / free-form user input.
    const lower = key.toLowerCase();
    if (
      lower.includes("thumbnail") ||
      lower.includes("image") ||
      lower.includes("photo") ||
      lower.includes("location") ||
      lower.includes("coords") ||
      lower.includes("gps") ||
      lower.includes("user") ||
      lower.includes("email")
    ) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = scrubValue(value, depth);
  }
  return out;
}

export function recordTelemetry(
  name: string,
  data: Record<string, unknown> = {},
): void {
  if (!telemetryEnabled) return;

  const allowedKeys = KNOWN_EVENTS[name];
  const scoped = allowedKeys
    ? Object.fromEntries(
        Object.entries(data).filter(([key]) => allowedKeys.includes(key)),
      )
    : data;

  const scrubbed = scrubRecord(scoped, 0);

  const event: TelemetryEvent = {
    name,
    timestamp: new Date().toISOString(),
    data: scrubbed,
  };

  logger.debug(`Telemetry: ${name}`, scrubbed);

  if (config.telemetryEndpoint && isBeaconSupported()) {
    try {
      const blob = new Blob([JSON.stringify(event)], {
        type: "application/json",
      });
      globalThis.navigator.sendBeacon(config.telemetryEndpoint, blob);
    } catch (err) {
      logger.warn("Beacon telemetry send failed:", err);
    }
  }
}
