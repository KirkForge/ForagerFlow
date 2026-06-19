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
