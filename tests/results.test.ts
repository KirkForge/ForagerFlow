import { describe, it, expect } from "vitest";
import { generatePredictionReport } from "@/inference/results";
import { Edibility, ModelKey } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";
const mockModel: ModelRegistryEntry = {
  key: ModelKey.BVRA,
  name: "Test model",
  size: "1 MB",
  path: "./test.onnx",
  labels: ["Agaricus bisporus", "Amanita phalloides", "Russula emetica"],
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  expectedLabelCount: 3,
  knowledge: {
    "Agaricus bisporus": {
      edibility: Edibility.Edible,
      notes: "Button mushroom.",
    },
    "Amanita phalloides": {
      edibility: Edibility.Poisonous,
      notes: "Death cap — fatal.",
    },
    "Russula emetica": {
      edibility: Edibility.Poisonous,
      notes: "Sickener.",
    },
  },
};

describe("generatePredictionReport", () => {
  it("generates report with correct number of predictions", () => {
    const logits = new Float32Array([2.0, 0.5, 1.0]);
    const report = generatePredictionReport(logits, mockModel);
    expect(report.predictions).toHaveLength(3);
  });

  it("ranks predictions by probability descending", () => {
    const logits = new Float32Array([0.5, 2.0, 1.0]);
    const report = generatePredictionReport(logits, mockModel);
    expect(report.predictions[0]!.probability).toBeGreaterThan(
      report.predictions[1]!.probability,
    );
    expect(report.predictions[1]!.probability).toBeGreaterThan(
      report.predictions[2]!.probability,
    );
  });

  it("flags poisonous species in top 3", () => {
    const logits = new Float32Array([5.0, 2.0, 1.0]);
    const report = generatePredictionReport(logits, mockModel);
    expect(report.hasPoisonousInTop3).toBe(true);
  });

  it("sets requiresWarning when top1 is poisonous with high confidence", () => {
    const logits = new Float32Array([0.5, 5.0, 1.0]);
    const report = generatePredictionReport(logits, mockModel);
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBeTruthy();
  });

  it("sets warning for low confidence", () => {
    const logits = new Float32Array([1.0, 1.0, 1.0]);
    const report = generatePredictionReport(logits, mockModel);
    expect(report.requiresWarning).toBe(true);
    expect(report.warningMessage).toBe(
      "Low confidence — do not act on this prediction.",
    );
  });

  it("sets no warning for high confidence edible prediction", () => {
    const logits = new Float32Array([10.0, 1.0, 0.5]);
    const report = generatePredictionReport(logits, mockModel);
    expect(report.requiresWarning).toBe(false);
  });

  it("flags unknown species in top 3 as poisonous (fail-closed)", () => {
    // A model that outputs a species with no knowledge entry must
    // be treated as poisonous for warning purposes. If the user
    // sees "Unknown" they may assume it is safe to eat.
    const logits = new Float32Array([10.0, 1.0, 0.5]);
    const report = generatePredictionReport(logits, mockModel);
    // Top-1 is Agaricus (known-Edible) → no warning here.
    expect(report.requiresWarning).toBe(false);
  });

  it("treats missing knowledge as poisonous (fail-closed)", () => {
    // Drop the knowledge for one of the labels so the top-1
    // prediction lands on a species with no edibility data.
    const modelWithoutEntry: ModelRegistryEntry = {
      ...mockModel,
      labels: ["Unlisted species", "Agaricus bisporus", "Amanita phalloides"],
      knowledge: {
        // intentionally no entry for "Unlisted species"
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
