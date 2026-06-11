import type {
  SpeciesKnowledge,
  Prediction,
} from "@/core/types";
import { Edibility } from "@/core/types";
import { softmax } from "@/inference/softmax";
import type { ModelRegistryEntry } from "@/core/types";

export interface PredictionReport {
  predictions: Prediction[];
  top1Species: string;
  top1Knowledge: SpeciesKnowledge;
  top1Probability: number;
  hasPoisonousInTop3: boolean;
  requiresWarning: boolean;
  warningMessage: string | null;
}

export function generatePredictionReport(
  logits: Float32Array,
  model: ModelRegistryEntry,
): PredictionReport {
  const probs = softmax(logits);
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

  const top1Knowledge =
    model.knowledge[top1.label] ?? missingKnowledgeFallback(top1.label);

  // Fail-closed: any top-3 prediction whose edibility is
  // Poisonous OR Unknown is treated as a "lookalike risk" so the
  // warning pipeline surfaces a "Cannot rule out a toxic
  // lookalike" message whenever the model isn't sure of its top
  // picks. An "Unknown" edibility is not a clean bill of health;
  // it is "we don't know if this will kill you", and that is
  // exactly the situation we want to warn about.
  const hasPoisonous = top3.some((p) => {
    const k = model.knowledge[p.label] ?? missingKnowledgeFallback(p.label);
    return (
      k.edibility === Edibility.Poisonous ||
      k.edibility === Edibility.Unknown
    );
  });

  const { requiresWarning, warningMessage } = computeWarning(
    top1.probability,
    top1Knowledge.edibility,
    hasPoisonous,
  );

  return {
    predictions: top3,
    top1Species: top1.label,
    top1Knowledge,
    top1Probability: top1.probability,
    hasPoisonousInTop3: hasPoisonous,
    requiresWarning,
    warningMessage,
  };
}

function missingKnowledgeFallback(species: string): SpeciesKnowledge {
  // Fail-closed: an unknown species gets the same warning treatment
  // as a confirmed poisonous one. Returning "Unknown" would let a
  // dangerous mushroom slip through the warning pipeline because
  // the user might not read the fine print. Better to over-warn.
  return {
    edibility: Edibility.Poisonous,
    notes: `No edibility data on file for "${species}". Treating as potentially poisonous; do not consume and verify with a certified mycologist.`,
  };
}

function computeWarning(
  top1Prob: number,
  edibility: Edibility,
  hasPoisonousInTop3: boolean,
): { requiresWarning: boolean; warningMessage: string | null } {
  if (top1Prob < 0.5) {
    return {
      requiresWarning: true,
      warningMessage: "Low confidence — do not act on this prediction.",
    };
  }

  if (hasPoisonousInTop3 && top1Prob < 0.85) {
    return {
      requiresWarning: true,
      warningMessage:
        "Cannot rule out a toxic lookalike. Do not consume. Always verify with a certified expert.",
    };
  }

  if (edibility === Edibility.Poisonous && top1Prob >= 0.5) {
    return {
      requiresWarning: true,
      warningMessage:
        "This prediction indicates a potentially poisonous species. Do not consume. Always verify with a certified expert.",
    };
  }

  if (edibility === Edibility.Unknown && top1Prob >= 0.5) {
    return {
      requiresWarning: true,
      warningMessage:
        "Edibility unknown or unverified for this species. Do not consume without positive identification by a certified mycologist.",
    };
  }

  return { requiresWarning: false, warningMessage: null };
}
