import type { SpeciesKnowledge, Prediction } from "@/core/types";
import { Edibility } from "@/core/types";
import { sanitizeText } from "@/core/sanitize";
import { t } from "@/i18n";
import { getLocalizedNotes } from "@/i18n/knowledge";
import type { CalibrationResult } from "@/inference/confidence";

export interface ComparisonItem {
  prediction: Prediction;
  knowledge: SpeciesKnowledge;
  confidence: CalibrationResult;
}

export class PredictionComparisonPanel {
  private readonly modal: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly grid: HTMLElement;
  private readonly safety: HTMLParagraphElement;
  private readonly closeBtn: HTMLButtonElement;

  constructor(root: HTMLElement | Document = document) {
    this.modal = this.require("#comparison-modal", root);
    this.title = this.require("#comparison-title", root);
    this.grid = this.require("#comparison-grid", root);
    this.safety = this.require("#comparison-safety", root);
    this.closeBtn = this.require("#comparison-close", root);
    this.bindClose();
    this.title.textContent = t("comparison.title");
    this.closeBtn.setAttribute("aria-label", t("comparison.closeAria"));
  }

  open(items: ComparisonItem[]): void {
    this.grid.innerHTML = items
      .map((item, index) => this.renderCard(item, index))
      .join("");
    this.safety.textContent = t("detail.safetyReminder");
    this.modal.showModal();
  }

  close(): void {
    if (this.modal.open) {
      this.modal.close();
    }
    this.clear();
  }

  private clear(): void {
    this.grid.innerHTML = "";
    this.safety.textContent = "";
  }

  private renderCard(item: ComparisonItem, index: number): string {
    const { prediction, knowledge, confidence } = item;
    const rawPct = (prediction.probability * 100).toFixed(1);
    const calPct = (confidence.score * 100).toFixed(1);
    const edibilityClass = this.edibilityClass(knowledge.edibility);
    const edibilityText = this.edibilityText(knowledge.edibility);
    const reliabilityClass = `reliability-${confidence.reliability}`;
    const reliabilityText = t(
      `confidence.reliability${this.capitalize(confidence.reliability)}`,
    );
    const verifyUrl = new URL("https://www.google.com/search");
    verifyUrl.searchParams.set(
      "q",
      `${prediction.label} mushroom identification`,
    );

    return `
      <div class="comparison-card" data-index="${String(index)}" tabindex="0">
        <h3>${sanitizeText(prediction.label)}</h3>
        <div class="detail-meta">
          <span class="detail-edibility ${edibilityClass}">${edibilityText}</span>
          <span class="detail-reliability ${reliabilityClass}">${reliabilityText}</span>
        </div>
        <p class="detail-notes">${sanitizeText(
          getLocalizedNotes(knowledge) || t("knowledge.noData"),
        )}</p>
        <div class="comparison-stats">
          <span class="detail-confidence">${t("detail.confidence", { pct: rawPct })}</span>
          <span class="detail-calibrated">${t("detail.calibratedScore", { pct: calPct })}</span>
        </div>
        <a
          class="verify-link"
          target="_blank"
          rel="noopener noreferrer"
          href="${verifyUrl.toString()}"
          aria-label="${sanitizeText(t("prediction.verifyAriaLabel", { species: prediction.label }))}"
        >${t("prediction.verifyOnline")}</a>
      </div>
    `;
  }

  private bindClose(): void {
    this.closeBtn.addEventListener("click", () => {
      this.close();
    });
    this.modal.addEventListener("click", (e) => {
      const rect = this.modal.getBoundingClientRect();
      const inDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!inDialog) {
        this.close();
      }
    });
  }

  private edibilityClass(edibility: Edibility): string {
    switch (edibility) {
      case Edibility.Poisonous:
        return "poisonous";
      case Edibility.Unknown:
        return "unknown";
      case Edibility.Edible:
        return "edible";
    }
  }

  private edibilityText(edibility: Edibility): string {
    switch (edibility) {
      case Edibility.Poisonous:
        return t("prediction.poisonous");
      case Edibility.Unknown:
        return t("prediction.unknown");
      case Edibility.Edible:
        return t("prediction.edible");
    }
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private require<T extends HTMLElement>(
    sel: string,
    root: HTMLElement | Document,
  ): T {
    const el = root.querySelector(sel);
    if (!el)
      throw new Error(
        `PredictionComparisonPanel: required element not found: ${sel}`,
      );
    return el as T;
  }
}
