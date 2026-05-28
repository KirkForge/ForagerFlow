import { describe, it, expect } from "vitest";
import { TypedEmitter } from "@/core/emitter";

interface TestEvents {
  [key: string]: unknown;
  ping: string;
  count: number;
  done: undefined;
}

describe("TypedEmitter", () => {
  it("calls registered listener on emit", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const received: string[] = [];
    emitter.on("ping", (payload) => {
      received.push(payload);
    });
    emitter.emit("ping", "hello");
    expect(received).toEqual(["hello"]);
  });

  it("supports multiple listeners", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    emitter.on("ping", () => calls.push("a"));
    emitter.on("ping", () => calls.push("b"));
    emitter.emit("ping", "test");
    expect(calls).toEqual(["a", "b"]);
  });

  it("removes listener with off", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    const handler = (p: string) => calls.push(p);
    emitter.on("ping", handler);
    emitter.off("ping", handler);
    emitter.emit("ping", "ignored");
    expect(calls).toEqual([]);
  });

  it("clears all listeners", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    emitter.on("ping", () => calls.push("a"));
    emitter.on("count", () => calls.push("b"));
    emitter.removeAllListeners();
    emitter.emit("ping", "x");
    emitter.emit("count", 1);
    expect(calls).toEqual([]);
  });

  it("emits event with number payload", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const received: number[] = [];
    emitter.on("count", (n) => received.push(n));
    emitter.emit("count", 42);
    expect(received).toEqual([42]);
  });

  it("emits event with no payload", () => {
    const emitter = new TypedEmitter<TestEvents>();
    let called = false;
    emitter.on("done", () => { called = true; });
    emitter.emit("done");
    expect(called).toBe(true);
  });
});
