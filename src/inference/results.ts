import type { SpeciesKnowledge, Prediction } from "@/core/types";
import { Edibility } from "@/core/types";
import type { ProvenanceInfo } from "@/services/history";
import { softmax } from "@/inference/softmax";
import type { ModelRegistryEntry } from "@/core/types";
import { t } from "@/i18n";
import type { CalibrationResult } from "./confidence";
import { calibrateConfidence } from "./confidence";

export const UNKNOWN_PROVENANCE: ProvenanceInfo = {
  modelSourceHash: "unknown",
  onnxChecksum: "unknown",
  labelMapVersion: "unknown",
};

export interface PredictionReport {
  predictions: Prediction[];
  top1Species: string;
  top1Knowledge: SpeciesKnowledge;
  top1Probability: number;
  confidence: CalibrationResult;
  hasRiskInTop3: boolean;
  requiresWarning: boolean;
  warningMessage: string | null;
  provenance: ProvenanceInfo;
}

export function generatePredictionReport(
  logits: Float32Array,
  model: ModelRegistryEntry,
  provenance: ProvenanceInfo = UNKNOWN_PROVENANCE,
): PredictionReport {
  const scaled = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    scaled[i] = (logits[i] ?? 0) / model.temperature;
  }
  const probs = softmax(scaled);
  const ranked: Prediction[] = [];

  for (let i = 0; i < probs.length; i++) {
    ranked.push({
      label: model.labels[i] ?? "Unknown",
      probability: probs[i] ?? 0,
      index: i,
    });
  }

  ranked.sort((a, b) => b.probability - a.probability);
  const top3 = ranked.slice(0, 3);
  const top1 = top3[0];
  if (!top1) throw new Error("No predictions generated");

  const top2 = top3[1] ?? { label: "Unknown", probability: 0, index: -1 };
  const confidence = calibrateConfidence(top1.probability, top2.probability);

  const top1Knowledge =
    model.knowledge[top1.label] ?? missingKnowledgeFallback(top1.label);

  // Treat Poisonous or Unknown in the top 3 as a toxic-lookalike risk.
  const hasRiskInTop3 = top3.some((p) => {
    const k = model.knowledge[p.label] ?? missingKnowledgeFallback(p.label);
    return (
      k.edibility === Edibility.Poisonous || k.edibility === Edibility.Unknown
    );
  });

  const { requiresWarning, warningMessage } = computeWarning(
    confidence.score,
    top1Knowledge.edibility,
    hasRiskInTop3,
  );

  return {
    predictions: top3,
    top1Species: top1.label,
    top1Knowledge,
    top1Probability: top1.probability,
    confidence,
    hasRiskInTop3: hasRiskInTop3,
    requiresWarning,
    warningMessage,
    provenance,
  };
}

function missingKnowledgeFallback(species: string): SpeciesKnowledge {
  return {
    edibility: Edibility.Poisonous,
    notes: t("knowledge.fallbackNotes", { species }),
  };
}

const LOW_CONFIDENCE_THRESHOLD = 0.5;

function computeWarning(
  calibratedScore: number,
  edibility: Edibility,
  hasRiskInTop3: boolean,
): { requiresWarning: boolean; warningMessage: string | null } {
  // Top-1 is a known poisonous species: warn regardless of model confidence.
  if (edibility === Edibility.Poisonous) {
    return {
      requiresWarning: true,
      warningMessage: t("warning.poisonous"),
    };
  }

  // Top-1 edibility is unknown: fail-closed and treat as potentially poisonous.
  if (edibility === Edibility.Unknown) {
    return {
      requiresWarning: true,
      warningMessage: t("warning.unknown"),
    };
  }

  // A poisonous or unknown species appears in the top-k. This is a toxic-
  // lookalike scenario and must be surfaced even when top-1 is a confident
  // edible prediction, because confidence in the edible class is not evidence
  // against the dangerous neighbor.
  if (hasRiskInTop3) {
    return {
      requiresWarning: true,
      warningMessage: t("warning.toxicLookalike"),
    };
  }

  if (calibratedScore < LOW_CONFIDENCE_THRESHOLD) {
    return {
      requiresWarning: true,
      warningMessage: t("warning.lowConfidence"),
    };
  }

  return { requiresWarning: false, warningMessage: null };
}
