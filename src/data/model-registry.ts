import type { SpeciesKnowledge } from "@/core/types";
import { ModelKey } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";
import labelsBvra from "./labels-bvra.json";
import labelsDima806 from "./labels-dima806.json";
import knowledgeBvra from "./knowledge-bvra.json";
import knowledgeDima806 from "./knowledge-dima806.json";

export const modelRegistry: Record<ModelKey, ModelRegistryEntry> = {
  [ModelKey.BVRA]: {
    key: ModelKey.BVRA,
    name: "Specialist (215 classes)",
    size: "90 MB",
    path: "./model/fungitastic.onnx",
    labels: labelsBvra,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    expectedLabelCount: 215,
    knowledge: knowledgeBvra as Record<string, SpeciesKnowledge>,
  },
  [ModelKey.Dima806]: {
    key: ModelKey.Dima806,
    name: "General (100 classes)",
    size: "330 MB",
    path: "./model/dima806.onnx",
    labels: labelsDima806,
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5],
    expectedLabelCount: 100,
    knowledge: knowledgeDima806 as Record<string, SpeciesKnowledge>,
  },
};
