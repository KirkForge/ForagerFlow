import { describe, it, expect } from "vitest";
import { softmax } from "@/inference/softmax";

describe("softmax", () => {
  it("returns probabilities summing to ~1.0", () => {
    const logits = new Float32Array([1.0, 2.0, 3.0]);
    const result = softmax(logits);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("returns higher probability for higher logit", () => {
    const logits = new Float32Array([0.1, 0.2, 0.3]);
    const result = softmax(logits);
    expect(result[2]).toBeGreaterThan(result[1]!);
    expect(result[1]).toBeGreaterThan(result[0]!);
  });

  it("returns uniform distribution for equal logits", () => {
    const logits = new Float32Array([1, 1, 1, 1]);
    const result = softmax(logits);
    for (let i = 0; i < 4; i++) {
      expect(result[i]).toBeCloseTo(0.25, 5);
    }
  });

  it("handles single element", () => {
    const logits = new Float32Array([42]);
    const result = softmax(logits);
    expect(result[0]).toBeCloseTo(1.0, 5);
  });

  it("handles negative logits", () => {
    const logits = new Float32Array([-10, -5, 0]);
    const result = softmax(logits);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
    expect(result[2]).toBeGreaterThan(result[1]!);
    expect(result[1]).toBeGreaterThan(result[0]!);
  });

  it("handles large logits without overflow", () => {
    const logits = new Float32Array([1000, 1000, 1000]);
    const result = softmax(logits);
    for (let i = 0; i < 3; i++) {
      expect(result[i]).toBeCloseTo(1 / 3, 5);
    }
  });
});
