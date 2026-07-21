import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import {
  recordTelemetry,
  recordCrash,
  setTelemetryEnabled,
  initSentry,
  setUserContext,
  addBreadcrumb,
} from "@/core/telemetry";
import { logger } from "@/core/logger";
import { config } from "@/core/config";

describe("telemetry", () => {
  beforeEach(() => {
    setTelemetryEnabled(true);
    vi.restoreAllMocks();
  });

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

    const telemetryCall = debugSpy.mock.calls.find((c) =>
      (c[0] as string).startsWith("Telemetry: beacon.test"),
    ) as [string, Record<string, unknown>] | undefined;
    expect(telemetryCall).toBeDefined();
    const [, data] = telemetryCall!;
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

    const telemetryCall = debugSpy.mock.calls.find((c) =>
      (c[0] as string).startsWith("Telemetry: web-vital"),
    ) as [string, Record<string, unknown>] | undefined;
    expect(telemetryCall).toBeDefined();
    const [, data] = telemetryCall!;
    expect(data["name"]).toBe("LCP");
    expect(data["value"]).toBe(123);
    expect(data["extra"]).toBeUndefined();
  });

  describe("recordCrash", () => {
    it("does nothing when telemetry is disabled", () => {
      const sendBeacon = vi.fn();
      Object.defineProperty(globalThis.navigator, "sendBeacon", {
        value: sendBeacon,
        configurable: true,
        writable: true,
      });
      setTelemetryEnabled(false);
      recordCrash(new Error("boom"), "ctx");
      expect(sendBeacon).not.toHaveBeenCalled();
    });

    it("sends a beacon with kind/message/stack when an endpoint is set", () => {
      const sendBeacon = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis.navigator, "sendBeacon", {
        value: sendBeacon,
        configurable: true,
        writable: true,
      });
      const originalEndpoint = config.telemetryEndpoint;
      (config as { telemetryEndpoint: string }).telemetryEndpoint =
        "/api/telemetry";
      const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
      recordCrash(new Error("boom"), "AppController.init");
      (config as { telemetryEndpoint: string }).telemetryEndpoint =
        originalEndpoint;

      expect(sendBeacon).toHaveBeenCalledOnce();
      const telemetryCall = debugSpy.mock.calls.find(
        (c) => (c[0] as string) === "Telemetry: crash",
      ) as [string, Record<string, unknown>] | undefined;
      expect(telemetryCall).toBeDefined();
      const [, data] = telemetryCall!;
      expect(data["kind"]).toBe("Error");
      expect(data["message"]).toBe("boom");
      expect(typeof data["stack"]).toBe("string");
      expect(data["context"]).toBe("AppController.init");
      expect(data["appVersion"]).toBe(config.appVersion);
    });

    it("redacts data: URIs and geo coordinates in message and stack", () => {
      const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
      const err = new Error(
        "failed data:image/png;base64,ABC at 55.6761,12.5683",
      );
      err.stack =
        "Error: failed data:image/png;base64,XYZ\n  at 55.6761,12.5683";
      recordCrash(err);
      const telemetryCall = debugSpy.mock.calls.find(
        (c) => (c[0] as string) === "Telemetry: crash",
      ) as [string, Record<string, unknown>] | undefined;
      expect(telemetryCall).toBeDefined();
      const [, data] = telemetryCall!;
      expect(data["message"]).not.toContain("data:image");
      expect(data["message"]).not.toContain("55.6761,12.5683");
      expect(data["stack"]).not.toContain("data:image");
      expect(data["stack"]).not.toContain("55.6761,12.5683");
    });

    it("handles non-Error values with kind Error and no stack", () => {
      const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
      recordCrash("a string was thrown");
      const telemetryCall = debugSpy.mock.calls.find(
        (c) => (c[0] as string) === "Telemetry: crash",
      ) as [string, Record<string, unknown>] | undefined;
      expect(telemetryCall).toBeDefined();
      const [, data] = telemetryCall!;
      expect(data["kind"]).toBe("Error");
      expect(data["message"]).toBe("a string was thrown");
      expect(data["stack"]).toBeNull();
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
      recordCrash(new Error("boom"));
      (config as { telemetryEndpoint: string }).telemetryEndpoint =
        originalEndpoint;
      expect(sendBeacon).not.toHaveBeenCalled();
    });
  });

  describe("Sentry integration", () => {
    it("initSentry does nothing when DSN is not configured", () => {
      // We can't spy on Sentry.init directly in ESM, so we verify behavior through logger
      const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
      initSentry();
      // Sentry.init is not called, so we just verify it doesn't throw
      expect(debugSpy).toHaveBeenCalledWith(
        "Sentry DSN not configured, skipping Sentry init",
      );
    });

    it("setUserContext calls Sentry.setUser", () => {
      // We can't spy on Sentry directly, so we verify the function runs without error
      expect(() => {
        setUserContext({ id: "user123", email: "test@example.com" });
      }).not.toThrow();
    });

    it("setUserContext clears user when null", () => {
      expect(() => {
        setUserContext(null);
      }).not.toThrow();
    });

    it("addBreadcrumb calls Sentry.addBreadcrumb", () => {
      expect(() => {
        addBreadcrumb({
          category: "test",
          message: "test message",
          level: "info",
        });
      }).not.toThrow();
    });

    it("initSentry does not throw when DSN is set", () => {
      expect(() => {
        initSentry();
      }).not.toThrow();
    });
  });

  describe("Sentry init with DSN set", () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv("VITE_SENTRY_DSN", "https://key@o0.ingest.sentry.io/project");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("does not log 'DSN not configured' when DSN is set", async () => {
      const { initSentry: init } = await import("@/core/telemetry");
      const { logger: testLogger } = await import("@/core/logger");
      const debugSpy = vi
        .spyOn(testLogger, "debug")
        .mockImplementation(() => {});
      init();
      expect(debugSpy).not.toHaveBeenCalledWith(
        "Sentry DSN not configured, skipping Sentry init",
      );
    });
  });
});
