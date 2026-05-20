import { describe, it, expect } from "vitest";
import { modelRegistry } from "@/data/model-registry";
import { ModelKey } from "@/core/types";

describe("modelRegistry", () => {
  it("has BVRA model registered", () => {
    const model = modelRegistry[ModelKey.BVRA];
    expect(model).toBeDefined();
    expect(model.key).toBe(ModelKey.BVRA);
    expect(model.expectedLabelCount).toBe(215);
    expect(model.labels).toHaveLength(215);
    expect(model.mean).toHaveLength(3);
    expect(model.std).toHaveLength(3);
  });

  it("has Dima806 model registered", () => {
    const model = modelRegistry[ModelKey.Dima806];
    expect(model).toBeDefined();
    expect(model.key).toBe(ModelKey.Dima806);
    expect(model.expectedLabelCount).toBe(100);
    expect(model.labels).toHaveLength(100);
  });

  it("BVRA labels are mostly unique (one intentional duplicate)", () => {
    const labels = modelRegistry[ModelKey.BVRA].labels;
    const unique = new Set(labels);
    expect(unique.size).toBeGreaterThanOrEqual(labels.length - 1);
  });

  it("Dima806 labels are unique", () => {
    const labels = modelRegistry[ModelKey.Dima806].labels;
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("BVRA knowledge covers all labels", () => {
    const model = modelRegistry[ModelKey.BVRA];
    for (const label of model.labels) {
      expect(
        model.knowledge[label],
        `Missing knowledge for ${label}`,
      ).toBeDefined();
    }
  });

  it("Dima806 knowledge covers all labels", () => {
    const model = modelRegistry[ModelKey.Dima806];
    for (const label of model.labels) {
      expect(
        model.knowledge[label],
        `Missing knowledge for ${label}`,
      ).toBeDefined();
    }
  });
});
