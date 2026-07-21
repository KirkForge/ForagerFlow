import * as Sentry from "@sentry/browser";
import type { ErrorEvent, EventHint } from "@sentry/browser";
import { logger } from "./logger";
import { config } from "./config";

interface TransactionEvent extends Sentry.Event {
  type: "transaction";
}

export interface TelemetryEvent {
  name: string;
  timestamp: string;
  data: Record<string, unknown>;
}

let telemetryEnabled = config.features.telemetry;
let sentryInitialized = false;

export function setTelemetryEnabled(enabled: boolean): void {
  telemetryEnabled = enabled;
}

const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_LENGTH = 32;
const MAX_OBJECT_DEPTH = 3;
const REDACTED = "[REDACTED]";

const KNOWN_EVENTS: Record<string, string[]> = {
  "web-vital": ["name", "value", "rating", "delta", "navigationType"],
};

function looksLikeSensitive(value: string): boolean {
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

export function initSentry(): void {
  if (sentryInitialized || !telemetryEnabled) return;

  const dsn = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;
  if (!dsn) {
    logger.debug("Sentry DSN not configured, skipping Sentry init");
    return;
  }

  Sentry.init({
    dsn,
    release: config.appVersion,
    environment: import.meta.env.MODE,
    tracePropagationTargets: ["localhost", /^\//],
    beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
      return event;
    },
    beforeSendTransaction(
      event: TransactionEvent,
      _hint: EventHint,
    ): TransactionEvent | null {
      return event;
    },
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed",
    ],
    debug: import.meta.env.DEV,
  });

  Sentry.setTag("app", "foragerflow");

  sentryInitialized = true;
  logger.debug("Sentry initialized", { release: config.appVersion });
}

function redactSensitiveSubstrings(value: string): string {
  return value
    .replace(/data:[^\s,]*/g, REDACTED)
    .replace(/-?\d{1,3}\.\d+,-?\d{1,3}\.\d+/g, REDACTED);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function recordTelemetry(
  name: string,
  data: Record<string, unknown> = {},
): void {
  if (!telemetryEnabled) return;

  initSentry();

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

  Sentry.addBreadcrumb({
    category: "telemetry",
    message: name,
    data: scrubbed,
    level: "info",
    timestamp: Date.now() / 1000,
  });

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

function isBeaconSupported(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "navigator" in globalThis &&
    typeof globalThis.navigator.sendBeacon === "function"
  );
}

export function recordCrash(error: unknown, context = ""): void {
  if (!telemetryEnabled) return;

  initSentry();

  const isError = error instanceof Error;
  const message = redactSensitiveSubstrings(
    truncate(isError ? error.message : String(error), 512),
  );
  const stack = isError
    ? redactSensitiveSubstrings(truncate(error.stack ?? "", 2048))
    : null;

  const data: Record<string, unknown> = {
    kind: isError ? error.constructor.name : "Error",
    message,
    stack,
    context: redactSensitiveSubstrings(truncate(context, 256)),
    appVersion: config.appVersion,
    href: typeof location !== "undefined" ? location.pathname : "",
  };

  const event: TelemetryEvent = {
    name: "crash",
    timestamp: new Date().toISOString(),
    data,
  };

  logger.debug("Telemetry: crash", data);

  Sentry.captureException(error, {
    extra: data,
    tags: {
      context,
      appVersion: config.appVersion,
    },
  });

  if (config.telemetryEndpoint && isBeaconSupported()) {
    try {
      const blob = new Blob([JSON.stringify(event)], {
        type: "application/json",
      });
      globalThis.navigator.sendBeacon(config.telemetryEndpoint, blob);
    } catch (err) {
      logger.warn("Beacon crash send failed:", err);
    }
  }
}

export function setUserContext(
  user: { id: string; email?: string; username?: string } | null,
): void {
  if (!telemetryEnabled) return;
  initSentry();
  Sentry.setUser(user);
}

export function addBreadcrumb(breadcrumb: {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  level?: "debug" | "info" | "warning" | "error";
}): void {
  if (!telemetryEnabled) return;
  initSentry();
  Sentry.addBreadcrumb({
    ...breadcrumb,
    timestamp: Date.now() / 1000,
  });
}

export { Sentry };
