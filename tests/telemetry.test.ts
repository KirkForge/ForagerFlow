import { describe, it, expect, afterEach, vi } from "vitest";
import { recordTelemetry, setTelemetryEnabled } from "@/core/telemetry";
import { logger } from "@/core/logger";
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

  it("does not send a beacon when no endpoint is configured", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: sendBeacon,
      configurable: true,
      writable: true,
    });

    const originalEndpoint = config.telemetryEndpoint;
    (config as { telemetryEndpoint: string }).telemetryEndpoint = "";
    recordTelemetry("no.endpoint");
    (config as { telemetryEndpoint: string }).telemetryEndpoint =
      originalEndpoint;

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("does not throw when sendBeacon throws", () => {
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: () => {
        throw new Error("beacon blocked");
      },
      configurable: true,
      writable: true,
    });

    const originalEndpoint = config.telemetryEndpoint;
    (config as { telemetryEndpoint: string }).telemetryEndpoint =
      "/api/telemetry";

    expect(() => {
      recordTelemetry("beacon.throws");
    }).not.toThrow();

    (config as { telemetryEndpoint: string }).telemetryEndpoint =
      originalEndpoint;
  });

  it("redacts sensitive telemetry values", () => {
    const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
    recordTelemetry("beacon.test", {
      image: "data:image/png;base64,ABC",
      location: "55.6761,12.5683",
      long: "x".repeat(500),
      safe: "ok",
    });

    const [, data] = debugSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(data["image"]).toBe("[REDACTED]");
    expect(data["location"]).toBe("[REDACTED]");
    expect(data["long"]).toHaveLength(256);
    expect(data["safe"]).toBe("ok");
  });

  it("scopes web-vital events to known fields", () => {
    const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
    recordTelemetry("web-vital", {
      name: "LCP",
      value: 123,
      extra: "should be dropped",
    });

    const [, data] = debugSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(data["name"]).toBe("LCP");
    expect(data["value"]).toBe(123);
    expect(data["extra"]).toBeUndefined();
  });
});
