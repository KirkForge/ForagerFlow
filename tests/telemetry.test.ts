import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordTelemetry,
  addTelemetryHandler,
  removeTelemetryHandler,
  measureSync,
  measureAsync,
  setTelemetryEnabled,
  createBeaconTelemetryHandler,
  createLocalStorageTelemetryHandler,
  createConsoleTelemetryHandler,
  readBufferedTelemetry,
  clearBufferedTelemetry,
} from "@/core/telemetry";

const STORAGE_KEY = "foragerflow.telemetry.buffer";

describe("telemetry", () => {
  beforeEach(() => {
    setTelemetryEnabled(true);
    localStorage.clear();
  });

  afterEach(() => {
    setTelemetryEnabled(true);
    localStorage.clear();
  });

  it("calls registered handler on recordTelemetry", () => {
    const events: unknown[] = [];
    const handler = (event: unknown) => events.push(event);
    addTelemetryHandler(handler);
    recordTelemetry("test.event", { key: "value" });
    removeTelemetryHandler(handler);
    expect(events).toHaveLength(1);
  });

  it("does not call removed handler", () => {
    const events: unknown[] = [];
    const handler = (event: unknown) => events.push(event);
    addTelemetryHandler(handler);
    removeTelemetryHandler(handler);
    recordTelemetry("test.event2");
    expect(events).toHaveLength(0);
  });

  it("measureSync records success event", () => {
    const events: unknown[] = [];
    const handler = (event: unknown) => events.push(event);
    addTelemetryHandler(handler);
    const result = measureSync("op", () => 42);
    removeTelemetryHandler(handler);
    expect(result).toBe(42);
    expect(events).toHaveLength(1);
  });

  it("measureSync records error event on throw", () => {
    const events: unknown[] = [];
    const handler = (event: unknown) => events.push(event);
    addTelemetryHandler(handler);
    expect(() =>
      measureSync("fail", () => {
        throw new Error("boom");
      }),
    ).toThrow();
    removeTelemetryHandler(handler);
    expect(events).toHaveLength(1);
  });

  it("measureAsync records success event", async () => {
    const events: unknown[] = [];
    const handler = (event: unknown) => events.push(event);
    addTelemetryHandler(handler);
    const result = await measureAsync("async-op", () => Promise.resolve("ok"));
    removeTelemetryHandler(handler);
    expect(result).toBe("ok");
    expect(events).toHaveLength(1);
  });

  it("measureAsync records error event on rejection", async () => {
    const events: unknown[] = [];
    const handler = (event: unknown) => events.push(event);
    addTelemetryHandler(handler);
    await expect(
      measureAsync("async-fail", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow();
    removeTelemetryHandler(handler);
    expect(events).toHaveLength(1);
  });

  it("handler errors do not prevent other handlers", () => {
    const results: string[] = [];
    const badHandler = () => {
      throw new Error("bad");
    };
    const goodHandler = () => {
      results.push("good");
    };
    addTelemetryHandler(badHandler);
    addTelemetryHandler(goodHandler);
    recordTelemetry("test.resilient");
    removeTelemetryHandler(badHandler);
    removeTelemetryHandler(goodHandler);
    expect(results).toEqual(["good"]);
  });

  it("setTelemetryEnabled(false) suppresses events", () => {
    const events: unknown[] = [];
    const handler = (event: unknown) => events.push(event);
    addTelemetryHandler(handler);
    setTelemetryEnabled(false);
    recordTelemetry("suppressed");
    setTelemetryEnabled(true);
    recordTelemetry("after-re-enable");
    removeTelemetryHandler(handler);
    expect(events).toHaveLength(1);
  });

  it("createBeaconTelemetryHandler sends a beacon when available", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: sendBeacon,
      configurable: true,
      writable: true,
    });

    const handler = createBeaconTelemetryHandler("/api/telemetry");
    addTelemetryHandler(handler);
    recordTelemetry("beacon.test", { value: 1 });
    removeTelemetryHandler(handler);

    expect(sendBeacon).toHaveBeenCalledOnce();
    const [url, blob] = sendBeacon.mock.calls[0] as [
      string,
      Blob | string | undefined,
    ];
    expect(url).toBe("/api/telemetry");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("createBeaconTelemetryHandler does nothing when sendBeacon is unavailable", () => {
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const handler = createBeaconTelemetryHandler("/api/telemetry");
    expect(() => {
      handler({ name: "x", timestamp: "t", data: {} });
    }).not.toThrow();
  });

  it("createLocalStorageTelemetryHandler buffers events", () => {
    const handler = createLocalStorageTelemetryHandler(5);
    addTelemetryHandler(handler);
    recordTelemetry("a");
    recordTelemetry("b");
    removeTelemetryHandler(handler);

    const buffered = readBufferedTelemetry();
    expect(buffered.map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("createLocalStorageTelemetryHandler rotates at maxEvents", () => {
    const handler = createLocalStorageTelemetryHandler(3);
    addTelemetryHandler(handler);
    recordTelemetry("a");
    recordTelemetry("b");
    recordTelemetry("c");
    recordTelemetry("d");
    removeTelemetryHandler(handler);

    const buffered = readBufferedTelemetry();
    expect(buffered.map((e) => e.name)).toEqual(["b", "c", "d"]);
  });

  it("readBufferedTelemetry returns an empty array when localStorage is empty", () => {
    expect(readBufferedTelemetry()).toEqual([]);
  });

  it("clearBufferedTelemetry removes buffered events", () => {
    const handler = createLocalStorageTelemetryHandler(10);
    addTelemetryHandler(handler);
    recordTelemetry("x");
    removeTelemetryHandler(handler);
    expect(readBufferedTelemetry()).toHaveLength(1);
    clearBufferedTelemetry();
    expect(readBufferedTelemetry()).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("createConsoleTelemetryHandler logs to the console", () => {
    const infoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const handler = createConsoleTelemetryHandler();
    addTelemetryHandler(handler);
    recordTelemetry("console.test");
    removeTelemetryHandler(handler);
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});
