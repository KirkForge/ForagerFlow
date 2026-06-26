import {
  Edibility,
  type SpeciesKnowledge,
  type Prediction,
} from "@/core/types";
import { t } from "@/i18n";
import { getLocalizedNotes } from "@/i18n/knowledge";
import type { CalibrationResult } from "@/inference/confidence";
import { createEl } from "@/ui/utils";

export class SpeciesDetailPanel {
  private readonly modal: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly meta: HTMLElement;
  private readonly notes: HTMLParagraphElement;
  private readonly safety: HTMLParagraphElement;
  private readonly verify: HTMLAnchorElement;
  private readonly closeBtn: HTMLButtonElement;

  constructor(root: HTMLElement | Document = document) {
    this.modal = this.require("#species-detail-modal", root);
    this.title = this.require("#species-detail-title", root);
    this.meta = this.require("#species-detail-meta", root);
    this.notes = this.require("#species-detail-notes", root);
    this.safety = this.require("#species-detail-safety", root);
    this.verify = this.require("#species-detail-verify", root);
    this.closeBtn = this.require("#species-detail-close", root);
    this.bindClose();
    this.closeBtn.setAttribute("aria-label", t("detail.closeAria"));
  }

  open(
    label: string,
    prediction: Prediction,
    knowledge: SpeciesKnowledge,
    confidence: CalibrationResult,
  ): void {
    this.title.textContent = label;
    this.notes.textContent =
      getLocalizedNotes(knowledge) || t("knowledge.noData");
    this.safety.textContent = t("detail.safetyReminder");

    const rawPct = (prediction.probability * 100).toFixed(1);
    const calPct = (confidence.score * 100).toFixed(1);
    const edibilityClass = this.edibilityClass(knowledge.edibility);
    const edibilityText = this.edibilityText(knowledge.edibility);
    const reliabilityClass = `reliability-${confidence.reliability}`;
    const reliabilityText = t(
      `confidence.reliability${this.capitalize(confidence.reliability)}`,
    );

    this.meta.innerHTML = "";
    this.meta.appendChild(
      createEl("span", `detail-edibility ${edibilityClass}`, edibilityText),
    );
    this.meta.appendChild(
      createEl(
        "span",
        `detail-reliability ${reliabilityClass}`,
        reliabilityText,
      ),
    );
    this.meta.appendChild(
      createEl(
        "span",
        "detail-confidence",
        t("detail.confidence", { pct: rawPct }),
      ),
    );
    this.meta.appendChild(
      createEl(
        "span",
        "detail-calibrated",
        t("detail.calibratedScore", { pct: calPct }),
      ),
    );

    const verifyUrl = new URL("https://www.google.com/search");
    verifyUrl.searchParams.set("q", `${label} mushroom identification`);
    this.verify.href = verifyUrl.toString();
    this.verify.target = "_blank";
    this.verify.rel = "noopener noreferrer";
    this.verify.textContent = t("prediction.verifyOnline");
    this.verify.setAttribute(
      "aria-label",
      t("prediction.verifyAriaLabel", { species: label }),
    );

    this.modal.showModal();
  }

  close(): void {
    if (this.modal.open) {
      this.modal.close();
    }
    this.clear();
  }

  private clear(): void {
    this.title.textContent = "";
    this.meta.innerHTML = "";
    this.notes.textContent = "";
    this.safety.textContent = "";
    this.verify.href = "#";
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
      throw new Error(`SpeciesDetailPanel: required element not found: ${sel}`);
    return el as T;
  }
}
