import { describe, it, expect } from "vitest";
import { ModelKey } from "@/core/types";
import { modelRegistry } from "@/data/model-registry";
import bvraFixture from "./fixtures/bvra-T.json";
import dimaFixture from "./fixtures/dima806-T.json";

function softmax(x: number[]): number[] {
  const max = Math.max(...x);
  const e = x.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

function computeEce(probs: number[][], labels: number[], nBins = 10): number {
  const n = probs.length;
  const binBoundaries = Array.from({ length: nBins + 1 }, (_, i) => i / nBins);
  let ece = 0;
  for (let i = 0; i < nBins; i++) {
    const lo = binBoundaries[i]!;
    const hi = binBoundaries[i + 1]!;
    const inBin: number[] = [];
    for (let j = 0; j < n; j++) {
      const conf = Math.max(...probs[j]!);
      if (conf > lo && conf <= hi) inBin.push(j);
    }
    if (inBin.length === 0) continue;
    const binAcc =
      inBin.filter((j) => probs[j]![labels[j]!]! > 0.5).length / inBin.length;
    const binConf =
      inBin.reduce((s, j) => s + Math.max(...probs[j]!), 0) / inBin.length;
    ece += inBin.length * Math.abs(binAcc - binConf);
  }
  return ece / n;
}

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

  it("temperature scaling reduces ECE on synthetic logits (BVRA)", () => {
    const T = modelRegistry[ModelKey.BVRA].temperature;
    const labels = [0, 1, 2, 3, 4];
    const rawLogits = [
      [5.0, 2.0, 0.5, 0.1, 0.01],
      [1.5, 4.0, 0.3, 0.2, 0.1],
      [0.8, 0.6, 3.5, 0.2, 0.1],
      [0.1, 0.3, 0.2, 4.5, 0.05],
      [0.05, 0.1, 0.15, 0.2, 5.0],
    ];
    const uncalProbs = rawLogits.map((l) => softmax(l));
    const calProbs = rawLogits.map((l) => softmax(l.map((v) => v / T)));
    const eceUncal = computeEce(uncalProbs, labels);
    const eceCal = computeEce(calProbs, labels);
    expect(eceCal).toBeLessThan(eceUncal);
  });
});
