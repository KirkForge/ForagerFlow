import { describe, it, expect, afterEach, vi } from "vitest";
import { recordTelemetry, setTelemetryEnabled } from "@/core/telemetry";
import { config } from "@/core/config";

describe("telemetry", () => {
  afterEach(() => {
    setTelemetryEnabled(true);
    vi.restoreAllMocks();
  });

  it("does nothing when telemetry is disabled", () => {
    const sendBeacon = vi.fn();
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: sendBeacon,
      configurable: true,
      writable: true,
    });

    setTelemetryEnabled(false);
    recordTelemetry("test.disabled", { key: "value" });

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("sends a beacon when an endpoint is configured", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: sendBeacon,
      configurable: true,
      writable: true,
    });

    const originalEndpoint = config.telemetryEndpoint;
    (config as { telemetryEndpoint: string }).telemetryEndpoint =
      "/api/telemetry";
    recordTelemetry("beacon.test", { value: 1 });
    (config as { telemetryEndpoint: string }).telemetryEndpoint =
      originalEndpoint;

    expect(sendBeacon).toHaveBeenCalledOnce();
    const [url, blob] = sendBeacon.mock.calls[0] as [
      string,
      Blob | string | undefined,
    ];
    expect(url).toBe("/api/telemetry");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("does not throw when sendBeacon is unavailable", () => {
    const originalEndpoint = config.telemetryEndpoint;
    (config as { telemetryEndpoint: string }).telemetryEndpoint =
      "/api/telemetry";
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(() => {
      recordTelemetry("no-beacon");
    }).not.toThrow();

    (config as { telemetryEndpoint: string }).telemetryEndpoint =
      originalEndpoint;
  });
});
