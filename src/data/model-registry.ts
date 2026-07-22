import type { SpeciesKnowledge } from "@/core/types";
import { ModelKey } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";
import labelsBvra from "./labels-bvra.json";
import labelsDima806 from "./labels-dima806.json";
import knowledgeBvra from "./knowledge-bvra.json";
import knowledgeDima806 from "./knowledge-dima806.json";
import knowledgeBvraDa from "./knowledge-bvra-da.json";
import knowledgeDima806Da from "./knowledge-dima806-da.json";

type LocalizedKnowledge = Partial<Record<string, { notes: string }>>;

function mergeLocalizedNotes(
  base: Record<string, SpeciesKnowledge>,
  localized: LocalizedKnowledge,
): Record<string, SpeciesKnowledge> {
  const merged: Record<string, SpeciesKnowledge> = {};
  for (const [label, knowledge] of Object.entries(base)) {
    const da = localized[label];
    merged[label] = da
      ? { ...knowledge, localizedNotes: { da: da.notes } }
      : knowledge;
  }
  return merged;
}

export const modelRegistry: Record<ModelKey, ModelRegistryEntry> = {
  [ModelKey.BVRA]: {
    key: ModelKey.BVRA,
    // The label list has 215 entries but only 214 unique species names:
    // "Clitocybe nebularis" appears twice. This is an intentional quirk of
    // the BVRA training labels; the model still outputs 215 logits.
    name: "Specialist (215 classes)",
    size: "90 MB",
    // Absolute path so the worker (loaded from /assets/inference-worker-*.js)
    // resolves the model against the site root, not the worker's location.
    path: "/model/fungitastic.onnx",
    labels: labelsBvra,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    expectedLabelCount: labelsBvra.length,
    // Fitted via scripts/calibrate.py; provenance: tests/fixtures/bvra-T.json
    temperature: 0.1,
    knowledge: mergeLocalizedNotes(
      knowledgeBvra as Record<string, SpeciesKnowledge>,
      knowledgeBvraDa,
    ),
  },
  [ModelKey.Dima806]: {
    key: ModelKey.Dima806,
    name: "General (100 classes)",
    size: "330 MB",
    path: "/model/dima806.onnx",
    labels: labelsDima806,
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5],
    expectedLabelCount: labelsDima806.length,
    // No calibration run yet; T=1.0 means no scaling. provenance: tests/fixtures/dima806-T.json
    temperature: 1.0,
    knowledge: mergeLocalizedNotes(
      knowledgeDima806 as Record<string, SpeciesKnowledge>,
      knowledgeDima806Da,
    ),
  },
};
