export type Reliability = "high" | "medium" | "low";

export interface CalibrationResult {
  /** Calibrated confidence in [0, 1]. Lower than raw softmax when top-2 is close. */
  score: number;
  /** Human-readable reliability tier. */
  reliability: Reliability;
  /** Raw softmax gap between top-1 and top-2. */
  gap: number;
}

/**
 * Calibrate a raw top-1 softmax probability using the margin to the runner-up.
 *
 * The idea is simple: a narrow gap between top-1 and top-2 means the model is
 * internally uncertain, even if the raw probability looks high. We scale the
 * raw score by a factor derived from the gap, then cap at 1. This is a
 * lightweight heuristic — no temperature scaling or held-out calibration set —
 * so it stays offline and explainable.
 */
export function calibrateConfidence(
  top1Probability: number,
  top2Probability: number,
): CalibrationResult {
  const raw = clamp(top1Probability, 0, 1);
  const runnerUp = clamp(top2Probability, 0, raw);
  const gap = raw - runnerUp;

  // Scale raw confidence by how decisively top-1 beats top-2.
  // gap 1.0 -> multiplier 1.0; gap 0.0 -> multiplier 0.5.
  const multiplier = 0.5 + 0.5 * gap;
  const score = clamp(raw * multiplier, 0, 1);

  return {
    score,
    reliability: reliabilityTier(score),
    gap,
  };
}

function reliabilityTier(score: number): Reliability {
  if (score < 0.5) return "low";
  if (score < 0.75) return "medium";
  return "high";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
