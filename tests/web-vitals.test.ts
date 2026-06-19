import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  __resetForTests,
  initWebVitals,
} from "@/services/web-vitals";
import * as telemetry from "@/core/telemetry";
import { logger } from "@/core/logger";

describe("initWebVitals", () => {
  let recordSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let observers: PerformanceObserverMock[] = [];

  interface PerformanceEntryMock {
    startTime: number;
    value?: number;
    hadRecentInput?: boolean;
  }

  class PerformanceObserverMock {
    callback: (list: { getEntries: () => PerformanceEntryMock[] }) => void;
    type?: string;
    options?: { type: string; buffered?: boolean };

    constructor(
      callback: (list: { getEntries: () => PerformanceEntryMock[] }) => void,
    ) {
      this.callback = callback;
      observers.push(this);
    }

    observe(options: { type: string; buffered?: boolean }): void {
      this.options = options;
      this.type = options.type;
    }

    disconnect(): void {
      observers = observers.filter((o) => o !== this);
    }

    emit(entries: PerformanceEntryMock[]): void {
      this.callback({ getEntries: () => entries });
    }
  }

  beforeEach(() => {
    observers = [];
    __resetForTests();
    recordSpy = vi
      .spyOn(telemetry, "recordTelemetry")
      .mockImplementation(() => undefined);
    infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    globalThis.PerformanceObserver =
      PerformanceObserverMock as unknown as typeof PerformanceObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    observers = [];
  });

  function findWebVital(name: string): Record<string, unknown> | undefined {
    const calls = (
      recordSpy as unknown as {
        mock: { calls: [string, Record<string, unknown>][] };
      }
    ).mock.calls;
    return calls
      .map(([, data]) => data)
      .find((d) => d["name"] === name);
  }

  it("records LCP metric", () => {
    initWebVitals();
    const lcpObserver = observers.find(
      (o) => o.type === "largest-contentful-paint",
    );
    expect(lcpObserver).toBeDefined();
    lcpObserver!.emit([{ startTime: 1000, value: 0 }]);
    expect(findWebVital("LCP")).toMatchObject({ name: "LCP", value: 1000 });
  });

  it("rates LCP as needs-improvement", () => {
    initWebVitals();
    const lcpObserver = observers.find(
      (o) => o.type === "largest-contentful-paint",
    );
    lcpObserver!.emit([{ startTime: 3000 }]);
    expect(findWebVital("LCP")).toMatchObject({
      name: "LCP",
      value: 3000,
      rating: "needs-improvement",
    });
  });

  it("rates LCP as poor", () => {
    initWebVitals();
    const lcpObserver = observers.find(
      (o) => o.type === "largest-contentful-paint",
    );
    lcpObserver!.emit([{ startTime: 5000 }]);
    expect(findWebVital("LCP")).toMatchObject({
      name: "LCP",
      value: 5000,
      rating: "poor",
    });
  });

  it("records CLS metric", () => {
    initWebVitals();
    const clsObserver = observers.find((o) => o.type === "layout-shift");
    expect(clsObserver).toBeDefined();
    clsObserver!.emit([
      { startTime: 0, value: 0.05 },
      { startTime: 0, value: 0.02, hadRecentInput: true },
      { startTime: 0, value: 0.03 },
    ]);
    const cls = findWebVital("CLS");
    expect(cls).toMatchObject({ name: "CLS" });
    expect(cls?.["value"]).toBeGreaterThanOrEqual(0);
  });

  it("records TTFB metric from navigation entries", () => {
    const originalGetEntriesByType = performance.getEntriesByType;
    performance.getEntriesByType = vi
      .fn()
      .mockReturnValue([{ requestStart: 50, responseStart: 180 }]);

    initWebVitals();
    expect(findWebVital("TTFB")).toMatchObject({ name: "TTFB", value: 130 });

    performance.getEntriesByType = originalGetEntriesByType;
  });

  it("logs initialization", () => {
    initWebVitals();
    expect(infoSpy).toHaveBeenCalledWith("Web Vitals collection initialized");
  });

  it("is idempotent", () => {
    initWebVitals();
    initWebVitals();
    expect(observers).toHaveLength(2);
  });

  it("warns when PerformanceObserver throws", () => {
    globalThis.PerformanceObserver = vi.fn(() => {
      throw new Error("observer blocked");
    }) as unknown as typeof PerformanceObserver;

    initWebVitals();
    expect(warnSpy).toHaveBeenCalled();
  });
});
