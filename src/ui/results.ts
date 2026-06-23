import type { PredictionReport } from "@/inference/results";
import { Edibility } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";
import { sanitizeText } from "@/core/sanitize";
import { t } from "@/i18n";

export class ResultsRenderer {
  private container: HTMLElement;
  private predictionsEl: HTMLElement;
  private knowledgeEl: HTMLElement;
  private warningEl: HTMLElement;
  private modelSelect: HTMLSelectElement;

  constructor(root: HTMLElement) {
    this.container = root;
    this.predictionsEl = this.require("#predictions");
    this.knowledgeEl = this.require("#knowledge");
    this.warningEl = this.require("#warning");
    this.modelSelect = this.require("#model-select") as HTMLSelectElement;
    this.bindModelSelector();
  }

  clear(): void {
    this.predictionsEl.innerHTML = "";
    this.knowledgeEl.innerHTML = "";
    this.knowledgeEl.style.display = "none";
    this.warningEl.style.display = "none";
  }

  render(report: PredictionReport, model: ModelRegistryEntry): void {
    this.clear();

    if (report.requiresWarning && report.warningMessage) {
      this.warningEl.textContent = report.warningMessage;
      this.warningEl.style.display = "block";
    }

    this.predictionsEl.innerHTML = report.predictions
      .map((item) => this.renderPrediction(item, model))
      .join("");

    const top = report.predictions[0];
    if (top) {
      const k = model.knowledge[top.label] ?? {
        edibility: Edibility.Unknown,
        notes: t("knowledge.noData"),
      };
      const verifyUrl = new URL("https://www.google.com/search");
      verifyUrl.searchParams.set("q", `${top.label} mushroom identification`);

      this.knowledgeEl.innerHTML = `
        <h3>${sanitizeText(top.label)}</h3>
        <p>${sanitizeText(k.notes)}</p>
        <a class="verify-link" target="_blank" rel="noopener noreferrer" href="${verifyUrl.toString()}">${t("prediction.verifyOnline")}</a>
      `;
      const verify = this.knowledgeEl.querySelector(".verify-link");
      if (verify) {
        verify.setAttribute(
          "aria-label",
          t("prediction.verifyAriaLabel", { species: top.label }),
        );
      }
      this.knowledgeEl.style.display = "block";
    }
  }

  private renderPrediction(
    item: { label: string; probability: number },
    model: ModelRegistryEntry,
  ): string {
    const k = model.knowledge[item.label] ?? {
      edibility: Edibility.Unknown,
      notes: t("knowledge.noData"),
    };
    const pct = (item.probability * 100).toFixed(1);
    const isPoison = k.edibility === Edibility.Poisonous;
    const isUnknown = k.edibility === Edibility.Unknown;
    const edClass = isPoison ? "poisonous" : isUnknown ? "unknown" : "edible";
    const edText = isPoison
      ? t("prediction.poisonous")
      : isUnknown
        ? t("prediction.unknown")
        : t("prediction.edible");

    return `
      <div class="prediction">
        <div class="label">
          <div class="prediction-name">${sanitizeText(item.label)}</div>
          <div class="prediction-edibility ${edClass}">${edText}</div>
        </div>
        <div class="bar-wrap">
          <div class="bar" style="width: ${pct}%"></div>
        </div>
        <div class="pct">${pct}%</div>
      </div>
    `;
  }

  private bindModelSelector(): void {
    this.modelSelect.addEventListener("change", () => {
      const value = this.modelSelect.value;
      if (value === "bvra" || value === "dima806") {
        this.clear();
      }
    });
  }

  private require(selector: string): HTMLElement {
    const el = this.container.querySelector(selector);
    if (!el) throw new Error(`Required element not found: ${selector}`);
    return el as HTMLElement;
  }
}
