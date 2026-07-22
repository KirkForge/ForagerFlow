import { describe, it, expect } from "vitest";
import type { ProvenanceInfo } from "@/services/history";
import {
  UNKNOWN_PROVENANCE,
  generatePredictionReport,
} from "@/inference/results";
import { ModelKey, Edibility } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";

function makeMockModel(
  overrides: Partial<ModelRegistryEntry> = {},
): ModelRegistryEntry {
  return {
    key: ModelKey.BVRA,
    name: "Test model",
    size: "1 MB",
    path: "./test.onnx",
    labels: ["Species A", "Species B", "Species C"],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    expectedLabelCount: 3,
    temperature: 1.0,
    knowledge: {
      "Species A": { edibility: Edibility.Edible, notes: "Safe." },
      "Species B": { edibility: Edibility.Poisonous, notes: "Danger." },
      "Species C": { edibility: Edibility.Unknown, notes: "Uncertain." },
    },
    ...overrides,
  };
}

const provenanceWith: ProvenanceInfo = {
  modelSourceHash:
    "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456ab",
  onnxChecksum: "sha256:onnx123onnx123onnx123onnx123onnx123onnx123onnx12",
  labelMapVersion: "v1.0.0-abcd1234",
};

describe("provenance", () => {
  it("populates provenance on PredictionReport when provided", () => {
    const logits = new Float32Array([3.0, 1.0, 0.5]);
    const model = makeMockModel();
    const report = generatePredictionReport(logits, model, provenanceWith);
    expect(report.provenance).toEqual(provenanceWith);
    expect(report.provenance.modelSourceHash).toBe(
      "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456ab",
    );
  });

  it("populates unknown sentinel when provenance is missing", () => {
    const logits = new Float32Array([3.0, 1.0, 0.5]);
    const model = makeMockModel();
    const report = generatePredictionReport(logits, model);
    expect(report.provenance).toEqual(UNKNOWN_PROVENANCE);
    expect(report.provenance.modelSourceHash).toBe("unknown");
    expect(report.provenance.onnxChecksum).toBe("unknown");
    expect(report.provenance.labelMapVersion).toBe("unknown");
  });

  it("unknown sentinel satisfies ProvenanceInfo type (not undefined)", () => {
    const report = generatePredictionReport(
      new Float32Array([3.0, 1.0, 0.5]),
      makeMockModel(),
    );
    expect(report.provenance).not.toBeUndefined();
    expect(typeof report.provenance.modelSourceHash).toBe("string");
    expect(typeof report.provenance.onnxChecksum).toBe("string");
    expect(typeof report.provenance.labelMapVersion).toBe("string");
  });

  it("two entries with different onnxChecksum are distinguishable", () => {
    const logits = new Float32Array([3.0, 1.0, 0.5]);
    const model = makeMockModel();
    const provenanceA: ProvenanceInfo = {
      ...provenanceWith,
      onnxChecksum: "sha256:aaa",
    };
    const provenanceB: ProvenanceInfo = {
      ...provenanceWith,
      onnxChecksum: "sha256:bbb",
    };
    const reportA = generatePredictionReport(logits, model, provenanceA);
    const reportB = generatePredictionReport(logits, model, provenanceB);
    expect(reportA.provenance.onnxChecksum).not.toBe(
      reportB.provenance.onnxChecksum,
    );
  });
});
