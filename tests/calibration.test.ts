import { describe, it, expect } from "vitest";
import { ModelKey } from "@/core/types";
import { modelRegistry } from "@/data/model-registry";
import bvraFixture from "./fixtures/bvra-T.json";
import dimaFixture from "./fixtures/dima806-T.json";

describe("calibration", () => {
  it("BVRA temperature is finite and positive", () => {
    const bvra = modelRegistry[ModelKey.BVRA];
    expect(bvra.temperature).toBeTypeOf("number");
    expect(Number.isFinite(bvra.temperature)).toBe(true);
    expect(bvra.temperature).toBeGreaterThan(0);
  });

  it("BVRA temperature matches fixture", () => {
    const bvra = modelRegistry[ModelKey.BVRA];
    expect(bvra.temperature).toBe(bvraFixture.temperature);
  });

  it("calibrated ECE is strictly less than uncalibrated ECE (BVRA)", () => {
    expect(bvraFixture.ece).toBeLessThan(bvraFixture.ece_uncalibrated);
  });

  it("Dima806 temperature is finite and positive", () => {
    const dima = modelRegistry[ModelKey.Dima806];
    expect(dima.temperature).toBeTypeOf("number");
    expect(Number.isFinite(dima.temperature)).toBe(true);
    expect(dima.temperature).toBeGreaterThan(0);
  });

  it("Dima806 temperature matches fixture", () => {
    const dima = modelRegistry[ModelKey.Dima806];
    expect(dima.temperature).toBe(dimaFixture.temperature);
  });

  it("fixture self_referential flag is documented", () => {
    expect(bvraFixture.self_referential).toBe(true);
    expect(dimaFixture.self_referential).toBe(true);
  });
});
