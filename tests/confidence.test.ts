import { describe, it, expect } from "vitest";
import { calibrateConfidence } from "@/inference/confidence";

describe("calibrateConfidence", () => {
  it("returns high reliability when top-1 is strong and runner-up is far", () => {
    const result = calibrateConfidence(0.95, 0.03);
    expect(result.reliability).toBe("high");
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.gap).toBeCloseTo(0.92, 6);
  });

  it("penalizes a narrow gap even when raw top-1 looks decent", () => {
    const result = calibrateConfidence(0.6, 0.3);
    expect(result.reliability).toBe("low");
    expect(result.score).toBeLessThan(0.5);
    expect(result.gap).toBeCloseTo(0.3, 6);
  });

  it("returns medium reliability in the middle", () => {
    const result = calibrateConfidence(0.8, 0.15);
    expect(result.reliability).toBe("medium");
  });

  it("clamps values outside [0, 1]", () => {
    const result = calibrateConfidence(1.2, -0.1);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles equal top-1 and top-2 as very low reliability", () => {
    const result = calibrateConfidence(0.5, 0.5);
    expect(result.reliability).toBe("low");
    expect(result.score).toBeCloseTo(0.25, 6);
  });

  it("calculates exact score with formula raw * (0.5 + 0.5 * gap)", () => {
    const result = calibrateConfidence(0.9, 0.05);
    const gap = 0.85;
    const expected = 0.9 * (0.5 + 0.5 * gap);
    expect(result.score).toBeCloseTo(expected, 6);
  });
});
