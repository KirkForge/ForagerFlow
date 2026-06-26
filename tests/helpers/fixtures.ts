import { Edibility, ModelKey, type ModelRegistryEntry } from "@/core/types";
import type { PredictionReport } from "@/inference/results";
import type { HistoryEntry } from "@/services/history";

export function makeMockModel(
  overrides: Partial<ModelRegistryEntry> = {},
): ModelRegistryEntry {
  return {
    key: ModelKey.BVRA,
    name: "Test model",
    size: "1 MB",
    path: "./test.onnx",
    labels: ["Agaricus bisporus", "Amanita phalloides", "Russula emetica"],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    expectedLabelCount: 3,
    knowledge: {
      "Agaricus bisporus": { edibility: Edibility.Edible, notes: "Safe." },
      "Amanita phalloides": {
        edibility: Edibility.Poisonous,
        notes: "Death cap — fatal.",
      },
      "Russula emetica": { edibility: Edibility.Poisonous, notes: "Sickener." },
    },
    ...overrides,
  };
}

export function makeReport(
  overrides: Partial<PredictionReport> = {},
): PredictionReport {
  return {
    top1Species: "Agaricus bisporus",
    top1Probability: 0.95,
    top1Knowledge: { edibility: Edibility.Edible, notes: "Button mushroom." },
    confidence: { score: 0.95, reliability: "high", gap: 0.9 },
    predictions: [
      { label: "Agaricus bisporus", probability: 0.95, index: 0 },
      { label: "Amanita phalloides", probability: 0.03, index: 1 },
      { label: "Russula emetica", probability: 0.02, index: 2 },
    ],
    hasRiskInTop3: false,
    requiresWarning: false,
    warningMessage: null,
    ...overrides,
  };
}

export function makeHistoryEntry(
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  return {
    id: "h-1",
    timestamp: new Date().toISOString(),
    modelKey: ModelKey.BVRA,
    top1Species: "Agaricus bisporus",
    top1Probability: 0.95,
    top1Edibility: Edibility.Edible,
    predictions: [
      { label: "Agaricus bisporus", probability: 0.95 },
      { label: "Amanita phalloides", probability: 0.03 },
      { label: "Russula emetica", probability: 0.02 },
    ],
    thumbnail: "",
    notes: "Safe.",
    ...overrides,
  };
}
