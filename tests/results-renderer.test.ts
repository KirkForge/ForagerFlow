import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResultsRenderer } from "@/ui/results";
import { Edibility } from "@/core/types";
import { makeMockModel, makeReport } from "./helpers/fixtures";

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
      (root.querySelector("#knowledge") as HTMLElement).classList.contains(
        "hidden",
      ),
    ).toBe(true);
  });

  it("renders predictions with bars and percentages", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(makeReport(), makeMockModel());

    const predictions = root.querySelectorAll(".prediction");
    expect(predictions).toHaveLength(3);
    expect(root.querySelector(".bar")?.getAttribute("style")).toContain(
      "width: 95%",
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
      makeMockModel(),
    );

    const warning = root.querySelector("#warning") as HTMLElement;
    expect(warning.classList.contains("hidden")).toBe(false);
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
      makeMockModel(),
    );

    const warning = root.querySelector("#warning") as HTMLElement;
    expect(warning.classList.contains("hidden")).toBe(false);
    expect(warning.textContent).toContain("toxic lookalike");
  });

  it("renders knowledge panel with verify link", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(makeReport(), makeMockModel());

    const knowledge = root.querySelector("#knowledge") as HTMLElement;
    expect(knowledge.classList.contains("hidden")).toBe(false);
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
    renderer.render(report, {
      ...makeMockModel(),
      labels: ["Missing species"],
    });

    const label = root.querySelector(".prediction .label")!;
    expect(label.querySelector(".unknown")).toBeTruthy();
  });

  it("clears on model selector change", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(makeReport(), makeMockModel());
    expect(root.querySelectorAll(".prediction")).toHaveLength(3);

    const select = root.querySelector("#model-select") as HTMLSelectElement;
    select.value = "dima806";
    select.dispatchEvent(new Event("change"));

    expect(root.querySelectorAll(".prediction")).toHaveLength(0);
  });

  it("does not make predictions clickable when no callback is provided", () => {
    const renderer = new ResultsRenderer(root);
    renderer.render(makeReport(), makeMockModel());

    const prediction = root.querySelector(".prediction") as HTMLElement;
    expect(prediction.classList.contains("prediction-clickable")).toBe(false);
    expect(prediction.hasAttribute("role")).toBe(false);
  });

  it("invokes onPredictionClick when a prediction is clicked", () => {
    const onClick = vi.fn();
    const renderer = new ResultsRenderer(root, { onPredictionClick: onClick });
    renderer.render(makeReport(), makeMockModel());

    const prediction = root.querySelector(".prediction") as HTMLElement;
    expect(prediction.classList.contains("prediction-clickable")).toBe(true);
    prediction.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("Agaricus bisporus");
  });

  it("invokes onPredictionClick when knowledge box is clicked", () => {
    const onClick = vi.fn();
    const renderer = new ResultsRenderer(root, { onPredictionClick: onClick });
    renderer.render(makeReport(), makeMockModel());

    const knowledge = root.querySelector("#knowledge") as HTMLElement;
    knowledge.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("Agaricus bisporus");
  });

  it("supports keyboard activation on predictions", () => {
    const onClick = vi.fn();
    const renderer = new ResultsRenderer(root, { onPredictionClick: onClick });
    renderer.render(makeReport(), makeMockModel());

    const prediction = root.querySelector(".prediction") as HTMLElement;
    prediction.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("Agaricus bisporus");
  });

  describe("comparison mode", () => {
    it("toggles compare mode when compare button is clicked", () => {
      const renderer = new ResultsRenderer(root);
      renderer.render(makeReport(), makeMockModel());

      const toggle = root.querySelector("#compare-toggle") as HTMLButtonElement;
      toggle.click();

      expect(root.querySelectorAll(".compare-checkbox")).toHaveLength(3);
      expect(
        root.querySelector("#compare-toggle")!.getAttribute("aria-pressed"),
      ).toBe("true");

      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();
      expect(root.querySelectorAll(".compare-checkbox")).toHaveLength(0);
      expect(
        root.querySelector("#compare-toggle")!.getAttribute("aria-pressed"),
      ).toBe("false");
    });

    it("emits onComparisonChange when selections change", () => {
      const onChange = vi.fn();
      const renderer = new ResultsRenderer(root, {
        onComparisonChange: onChange,
      });
      renderer.render(makeReport(), makeMockModel());

      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();

      const boxes = root.querySelectorAll(
        ".compare-checkbox",
      ) as NodeListOf<HTMLInputElement>;
      boxes[0]!.click();
      expect(onChange).toHaveBeenLastCalledWith(["Agaricus bisporus"]);

      boxes[0]!.click();
      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("emits onComparisonShow with selected labels", () => {
      const onShow = vi.fn();
      const renderer = new ResultsRenderer(root, {
        onComparisonShow: onShow,
      });
      renderer.render(makeReport(), makeMockModel());

      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();

      const boxes = root.querySelectorAll(
        ".compare-checkbox",
      ) as NodeListOf<HTMLInputElement>;
      boxes[0]!.click();
      boxes[1]!.click();

      const showBtn = root.querySelector("#compare-show") as HTMLButtonElement;
      expect(showBtn.disabled).toBe(false);
      showBtn.click();

      expect(onShow).toHaveBeenCalledWith([
        "Agaricus bisporus",
        "Amanita phalloides",
      ]);
    });

    it("blocks selection beyond max compare and shows a message", () => {
      vi.useFakeTimers();
      const renderer = new ResultsRenderer(root);
      const model = makeMockModel({
        labels: ["A", "B", "C", "D"],
        knowledge: {
          A: { edibility: Edibility.Edible, notes: "A" },
          B: { edibility: Edibility.Edible, notes: "B" },
          C: { edibility: Edibility.Edible, notes: "C" },
          D: { edibility: Edibility.Edible, notes: "D" },
        },
      });
      renderer.render(
        makeReport({
          predictions: [
            { label: "A", probability: 0.5, index: 0 },
            { label: "B", probability: 0.3, index: 1 },
            { label: "C", probability: 0.15, index: 2 },
            { label: "D", probability: 0.05, index: 3 },
          ],
        }),
        model,
      );
      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();

      const boxes = root.querySelectorAll(
        ".compare-checkbox",
      ) as NodeListOf<HTMLInputElement>;
      for (const box of boxes) {
        box.click();
      }

      const checked = Array.from(boxes).filter((b) => b.checked);
      expect(checked).toHaveLength(3);
      const toolbar = root.querySelector(".compare-toolbar");
      const maxMsg = toolbar?.querySelector(".compare-max-msg");
      expect(maxMsg).not.toBeNull();
      expect(maxMsg?.textContent).toBeTruthy();

      vi.advanceTimersByTime(2500);
      expect(toolbar?.querySelector(".compare-max-msg")).toBeNull();
      vi.useRealTimers();
    });

    it("resets selection when toggling compare mode off", () => {
      const onChange = vi.fn();
      const renderer = new ResultsRenderer(root, {
        onComparisonChange: onChange,
      });
      renderer.render(makeReport(), makeMockModel());
      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();

      const boxes = root.querySelectorAll(
        ".compare-checkbox",
      ) as NodeListOf<HTMLInputElement>;
      boxes[0]!.click();

      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();
      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("keeps show button disabled until two selections", () => {
      const renderer = new ResultsRenderer(root);
      renderer.render(makeReport(), makeMockModel());
      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();

      const showBtn = root.querySelector("#compare-show") as HTMLButtonElement;
      expect(showBtn.disabled).toBe(true);

      const boxes = root.querySelectorAll(
        ".compare-checkbox",
      ) as NodeListOf<HTMLInputElement>;
      boxes[0]!.click();
      expect(showBtn.disabled).toBe(true);

      boxes[1]!.click();
      expect(showBtn.disabled).toBe(false);
    });

    it("does not invoke onPredictionClick when clicking checkbox or toolbar", () => {
      const onClick = vi.fn();
      const renderer = new ResultsRenderer(root, {
        onPredictionClick: onClick,
      });
      renderer.render(makeReport(), makeMockModel());
      (root.querySelector("#compare-toggle") as HTMLButtonElement).click();

      const box = root.querySelector(".compare-checkbox") as HTMLInputElement;
      box.click();
      expect(onClick).not.toHaveBeenCalled();

      const showBtn = root.querySelector("#compare-show") as HTMLButtonElement;
      showBtn.click();
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("warning paths", () => {
    it("does not show warning when requiresWarning is false", () => {
      const renderer = new ResultsRenderer(root);
      renderer.render(makeReport({ requiresWarning: false }), makeMockModel());

      expect(
        (root.querySelector("#warning") as HTMLElement).classList.contains(
          "hidden",
        ),
      ).toBe(true);
    });

    it("shows warning when message is present", () => {
      const renderer = new ResultsRenderer(root);
      renderer.render(
        makeReport({
          requiresWarning: true,
          warningMessage: "Poisonous result",
        }),
        makeMockModel(),
      );

      const warning = root.querySelector("#warning") as HTMLElement;
      expect(warning.classList.contains("hidden")).toBe(false);
      expect(warning.textContent).toBe("Poisonous result");
    });

    it("does not show warning when message is missing", () => {
      const renderer = new ResultsRenderer(root);
      renderer.render(
        makeReport({ requiresWarning: true, warningMessage: null }),
        makeMockModel(),
      );

      expect(
        (root.querySelector("#warning") as HTMLElement).classList.contains(
          "hidden",
        ),
      ).toBe(true);
    });
  });
});
