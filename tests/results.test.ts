import { describe, it, expect, beforeEach } from "vitest";
import { generatePredictionReport } from "@/inference/results";
import { Edibility, type ModelRegistryEntry } from "@/core/types";
import { makeMockModel } from "./helpers/fixtures";
import { setLocale } from "@/i18n";

describe("generatePredictionReport", () => {
  beforeEach(() => {
    setLocale("en");
  });
  it("generates report with correct number of predictions", () => {
    const logits = new Float32Array([2.0, 0.5, 1.0]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.predictions).toHaveLength(3);
  });

  it("ranks predictions by probability descending", () => {
    const logits = new Float32Array([0.5, 2.0, 1.0]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.predictions[0]!.probability).toBeGreaterThan(
      report.predictions[1]!.probability,
    );
    expect(report.predictions[1]!.probability).toBeGreaterThan(
      report.predictions[2]!.probability,
    );
  });

  it("flags poisonous species in top 3", () => {
    const logits = new Float32Array([5.0, 2.0, 1.0]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.hasRiskInTop3).toBe(true);
  });

  it("sets requiresWarning when top1 is poisonous with high confidence", () => {
    const logits = new Float32Array([0.5, 5.0, 1.0]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBeTruthy();
  });

  it("sets warning for low calibrated confidence", () => {
    const logits = new Float32Array([1.0, 1.0, 1.0]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBe(
      "Low confidence — do not act on this prediction.",
    );
  });

  it("calibrated score penalizes a narrow margin", () => {
    // Top-1 raw 0.6, top-2 raw 0.3, gap 0.3 -> calibrated ~0.39 (low).
    const logits = new Float32Array([
      Math.log(0.6),
      Math.log(0.3),
      Math.log(0.1),
    ]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.top1Probability).toBeGreaterThan(0.55);
    expect(report.confidence.score).toBeLessThan(0.5);
    expect(report.confidence.reliability).toBe("low");
  });

  it("sets no warning for high confidence edible prediction", () => {
    const logits = new Float32Array([10.0, 1.0, 0.5]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.requiresWarning).toBe(false);
    expect(report.confidence.reliability).toBe("high");
  });

  it("treats unknown species in top 3 as a risk when confidence is low", () => {
    const modelWithUnknown: ModelRegistryEntry = {
      ...makeMockModel(),
      knowledge: {
        ...makeMockModel().knowledge,
        "Russula emetica": { edibility: Edibility.Unknown, notes: "unknown" },
      },
    };
    const logits = new Float32Array([2.0, 1.5, 1.0]);
    const report = generatePredictionReport(logits, modelWithUnknown);
    expect(report.hasRiskInTop3).toBe(true);
    expect(report.requiresWarning).toBe(true);
  });

  it("treats missing knowledge as poisonous (fail-closed)", () => {
    const modelWithoutEntry: ModelRegistryEntry = {
      ...makeMockModel(),
      labels: ["Unlisted species", "Agaricus bisporus", "Amanita phalloides"],
      knowledge: {
        "Agaricus bisporus": { edibility: Edibility.Edible, notes: "ok" },
        "Amanita phalloides": { edibility: Edibility.Poisonous, notes: "no" },
      },
    };
    const logits = new Float32Array([10.0, 1.0, 0.5]);
    const report = generatePredictionReport(logits, modelWithoutEntry);
    expect(report.top1Species).toBe("Unlisted species");
    expect(report.top1Knowledge.edibility).toBe(Edibility.Poisonous);
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBeTruthy();
  });

  it("warns about toxic lookalike when confidence is moderate", () => {
    // Top-1 raw 0.7, top-2 raw 0.2, gap 0.5 -> calibrated score 0.7 * 0.75 = 0.525.
    const logits = new Float32Array([
      Math.log(0.7),
      Math.log(0.2),
      Math.log(0.1),
    ]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.hasRiskInTop3).toBe(true);
    expect(report.confidence.score).toBeGreaterThanOrEqual(0.5);
    expect(report.confidence.score).toBeLessThan(0.75);
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBe(
      "Cannot rule out a toxic lookalike. Do not consume. Always verify with a certified expert.",
    );
  });

  it("warns about unknown edibility at high confidence", () => {
    const modelWithUnknownTop1: ModelRegistryEntry = {
      ...makeMockModel(),
      knowledge: {
        ...makeMockModel().knowledge,
        "Agaricus bisporus": { edibility: Edibility.Unknown, notes: "unknown" },
      },
    };
    const logits = new Float32Array([10.0, 1.0, 0.5]);
    const report = generatePredictionReport(logits, modelWithUnknownTop1);
    expect(report.top1Knowledge.edibility).toBe(Edibility.Unknown);
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBe(
      "Edibility unknown or unverified for this species. Do not consume without positive identification by a certified mycologist.",
    );
  });
});
