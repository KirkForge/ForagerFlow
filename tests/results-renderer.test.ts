import { describe, it, expect, beforeEach } from "vitest";
import { ResultsRenderer } from "@/ui/results";
import { Edibility, ModelKey, type ModelRegistryEntry } from "@/core/types";
import type { PredictionReport } from "@/inference/results";

function makeReport(
  overrides: Partial<PredictionReport> = {},
): PredictionReport {
  return {
    top1Species: "Agaricus bisporus",
    top1Probability: 0.95,
    top1Knowledge: { edibility: Edibility.Edible, notes: "Button mushroom." },
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
    "Agaricus bisporus": { edibility: Edibility.Edible, notes: "Safe." },
    "Amanita phalloides": {
      edibility: Edibility.Poisonous,
      notes: "Death cap — fatal.",
    },
    "Russula emetica": { edibility: Edibility.Poisonous, notes: "Sickener." },
  },
};

function renderResultsHTML(): HTMLElement {
  document.body.innerHTML = `
    <div id="app">
      <div id="predictions"></div>
      <div id="knowledge"></div>
      <div id="warning"></div>
      <div id="low-confidence"></div>
      <select id="model-select">
        <option value="bvra">BVRA</option>
        <option value="dima806">dima806</option>
      </select>
    </div>
  `;
  return document.querySelector("#app") as HTMLElement;
}

describe("ResultsRenderer", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = renderResultsHTML();
  });

  it("throws when required elements are missing", () => {
    document.body.innerHTML = `<div id="app"></div>`;
    expect(() => new ResultsRenderer(document.querySelector("#app")!)).toThrow(
      /Required element not found/,
    );
  });

  it("clears previous content", () => {
    const renderer = new ResultsRenderer(root);
    const predictions = root.querySelector("#predictions")!;
    predictions.appendChild(document.createElement("div"));

    renderer.clear();
    expect(predictions.children).toHaveLength(0);
    expect(
      (root.querySelector("#knowledge") as HTMLElement).style.display,
    ).toBe("none");
  });

  it("renders predictions with bars and percentages", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(makeReport(), mockModel);

    const predictions = root.querySelectorAll(".prediction");
    expect(predictions).toHaveLength(3);
    expect(root.querySelector(".bar")?.getAttribute("style")).toContain(
      "width: 95.0%",
    );
    expect(root.querySelector(".pct")?.textContent).toBe("95.0%");
  });

  it("displays low confidence warning", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(
      makeReport({
        top1Probability: 0.4,
        requiresWarning: true,
        warningMessage: "Low confidence — do not act on this prediction.",
      }),
      mockModel,
    );

    const warning = root.querySelector("#warning") as HTMLElement;
    expect(warning.style.display).toBe("block");
    expect(warning.textContent).toContain("Low confidence");
  });

  it("displays toxic lookalike warning", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(
      makeReport({
        top1Probability: 0.7,
        hasRiskInTop3: true,
        requiresWarning: true,
        warningMessage:
          "Cannot rule out a toxic lookalike. Do not consume. Always verify with a certified expert.",
      }),
      mockModel,
    );

    const warning = root.querySelector("#warning") as HTMLElement;
    expect(warning.style.display).toBe("block");
    expect(warning.textContent).toContain("toxic lookalike");
  });

  it("renders knowledge panel with verify link", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(makeReport(), mockModel);

    const knowledge = root.querySelector("#knowledge") as HTMLElement;
    expect(knowledge.style.display).toBe("block");
    expect(knowledge.querySelector("h3")?.textContent).toBe(
      "Agaricus bisporus",
    );

    const link = knowledge.querySelector("a") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.href).toContain("google.com/search");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("falls back to unknown edibility for missing knowledge", () => {
    const renderer = new ResultsRenderer(root);
    const report = makeReport({
      predictions: [{ label: "Missing species", probability: 0.95, index: 0 }],
    });
    renderer.render(report, { ...mockModel, labels: ["Missing species"] });

    const label = root.querySelector(".prediction .label")!;
    expect(label.querySelector(".unknown")).toBeTruthy();
  });

  it("clears on model selector change", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(makeReport(), mockModel);
    expect(root.querySelectorAll(".prediction")).toHaveLength(3);

    const select = root.querySelector("#model-select") as HTMLSelectElement;
    select.value = "dima806";
    select.dispatchEvent(new Event("change"));

    expect(root.querySelectorAll(".prediction")).toHaveLength(0);
  });
});
