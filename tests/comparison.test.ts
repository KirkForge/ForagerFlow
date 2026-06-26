import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PredictionComparisonPanel,
  type ComparisonItem,
} from "@/ui/comparison";
import { Edibility } from "@/core/types";
import { setLocale } from "@/i18n";

function renderComparisonHTML(): void {
  document.body.innerHTML = `
    <dialog id="comparison-modal" aria-labelledby="comparison-title">
      <div class="comparison-content">
        <div class="comparison-header">
          <h2 id="comparison-title"></h2>
          <button id="comparison-close" type="button" value="close">×</button>
        </div>
        <div id="comparison-grid" class="comparison-grid"></div>
        <p id="comparison-safety" class="comparison-safety"></p>
      </div>
    </dialog>
  `;
  const dialog = document.querySelector(
    "#comparison-modal",
  ) as HTMLDialogElement;
  dialog.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  dialog.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
}

function makeItem(
  label: string,
  probability: number,
  edibility: Edibility,
  score: number,
  reliability: "high" | "medium" | "low",
): ComparisonItem {
  return {
    prediction: { label, probability, index: 0 },
    knowledge: { edibility, notes: `${label} notes.` },
    confidence: { score, reliability, gap: 0.1 },
  };
}

describe("PredictionComparisonPanel", () => {
  beforeEach(() => {
    setLocale("en");
    renderComparisonHTML();
  });

  it("throws when required elements are missing", () => {
    document.body.innerHTML = "";
    expect(() => new PredictionComparisonPanel()).toThrow(
      /PredictionComparisonPanel: required element not found/,
    );
  });

  it("opens with two comparison cards", () => {
    const panel = new PredictionComparisonPanel();
    panel.open([
      makeItem("Agaricus bisporus", 0.87, Edibility.Edible, 0.91, "high"),
      makeItem("Amanita phalloides", 0.45, Edibility.Poisonous, 0.42, "low"),
    ]);

    const modal = document.querySelector(
      "#comparison-modal",
    ) as HTMLDialogElement;
    expect(modal.open).toBe(true);

    const cards = document.querySelectorAll(".comparison-card");
    expect(cards.length).toBe(2);
    expect(cards[0]?.textContent).toContain("Agaricus bisporus");
    expect(cards[1]?.textContent).toContain("Amanita phalloides");
  });

  it("renders a safety reminder", () => {
    const panel = new PredictionComparisonPanel();
    panel.open([
      makeItem("Agaricus bisporus", 0.87, Edibility.Edible, 0.91, "high"),
      makeItem("Amanita phalloides", 0.45, Edibility.Poisonous, 0.42, "low"),
    ]);

    const safety = document.querySelector("#comparison-safety") as HTMLElement;
    expect(safety.textContent).toMatch(/verify/i);
  });

  it("closes when the close button is clicked", () => {
    const panel = new PredictionComparisonPanel();
    panel.open([
      makeItem("Agaricus bisporus", 0.87, Edibility.Edible, 0.91, "high"),
      makeItem("Amanita phalloides", 0.45, Edibility.Poisonous, 0.42, "low"),
    ]);

    const closeBtn = document.querySelector(
      "#comparison-close",
    ) as HTMLButtonElement;
    closeBtn.click();

    const modal = document.querySelector(
      "#comparison-modal",
    ) as HTMLDialogElement;
    expect(modal.open).toBe(false);
  });

  it("shows localized title in Danish", () => {
    setLocale("da");
    const panel = new PredictionComparisonPanel();
    panel.open([
      makeItem("Agaricus bisporus", 0.87, Edibility.Edible, 0.91, "high"),
      makeItem("Amanita phalloides", 0.45, Edibility.Poisonous, 0.42, "low"),
    ]);

    expect(document.querySelector("#comparison-title")?.textContent).toBe(
      "Sammenlign arter",
    );
  });
});
