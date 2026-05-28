import { describe, it, expect } from "vitest";
import { recordTelemetry, addTelemetryHandler, removeTelemetryHandler, measureSync } from "@/core/telemetry";

describe("telemetry", () => {
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
    expect(() => measureSync("fail", () => { throw new Error("boom"); })).toThrow();
    removeTelemetryHandler(handler);
    expect(events).toHaveLength(1);
  });

  it("handler errors do not prevent other handlers", () => {
    const results: string[] = [];
    const badHandler = () => { throw new Error("bad"); };
    const goodHandler = () => { results.push("good"); };
    addTelemetryHandler(badHandler);
    addTelemetryHandler(goodHandler);
    recordTelemetry("test.resilient");
    removeTelemetryHandler(badHandler);
    removeTelemetryHandler(goodHandler);
    expect(results).toEqual(["good"]);
  });
});
