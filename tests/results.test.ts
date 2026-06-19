import { describe, it, expect } from "vitest";
import { generatePredictionReport } from "@/inference/results";
import { Edibility, type ModelRegistryEntry } from "@/core/types";
import { makeMockModel } from "./helpers/fixtures";

describe("generatePredictionReport", () => {
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

  it("sets warning for low confidence", () => {
    const logits = new Float32Array([1.0, 1.0, 1.0]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBe(
      "Low confidence — do not act on this prediction.",
    );
  });

  it("sets no warning for high confidence edible prediction", () => {
    const logits = new Float32Array([10.0, 1.0, 0.5]);
    const report = generatePredictionReport(logits, makeMockModel());
    expect(report.requiresWarning).toBe(false);
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
});
