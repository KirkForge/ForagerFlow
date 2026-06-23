import type { PredictionReport } from "@/inference/results";
import { Edibility } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";
import { sanitizeText } from "@/core/sanitize";
import { t } from "@/i18n";
import { getLocalizedNotes } from "@/i18n/knowledge";

export interface ResultsRendererOptions {
  onPredictionClick?: (label: string) => void;
  onComparisonChange?: (labels: string[]) => void;
  onComparisonShow?: (labels: string[]) => void;
}

export class ResultsRenderer {
  private container: HTMLElement;
  private predictionsEl: HTMLElement;
  private knowledgeEl: HTMLElement;
  private warningEl: HTMLElement;
  private modelSelect: HTMLSelectElement;
  private onPredictionClick: ((label: string) => void) | undefined;
  private onComparisonChange: ((labels: string[]) => void) | undefined;
  private onComparisonShow: ((labels: string[]) => void) | undefined;
  private compareActive = false;
  private selectedLabels = new Set<string>();
  private readonly maxCompare = 3;

  constructor(root: HTMLElement, opts: ResultsRendererOptions = {}) {
    this.container = root;
    this.predictionsEl = this.require("#predictions");
    this.knowledgeEl = this.require("#knowledge");
    this.warningEl = this.require("#warning");
    this.modelSelect = this.require("#model-select") as HTMLSelectElement;
    this.onPredictionClick = opts.onPredictionClick;
    this.onComparisonChange = opts.onComparisonChange;
    this.onComparisonShow = opts.onComparisonShow;
    this.bindModelSelector();
    this.bindPredictionClicks();
    this.bindComparisonControls();
  }

  clear(): void {
    this.predictionsEl.innerHTML = "";
    this.knowledgeEl.innerHTML = "";
    this.knowledgeEl.style.display = "none";
    this.warningEl.style.display = "none";
    this.compareActive = false;
    this.selectedLabels.clear();
  }

  render(report: PredictionReport, model: ModelRegistryEntry): void {
    this.clear();
    this.compareActive = false;
    this.selectedLabels.clear();

    if (report.requiresWarning && report.warningMessage) {
      this.warningEl.textContent = report.warningMessage;
      this.warningEl.style.display = "block";
    }

    const toolbar = this.renderCompareToolbar();
    const predictionsHtml = report.predictions
      .map((item) => this.renderPrediction(item, model))
      .join("");
    this.predictionsEl.innerHTML = toolbar + predictionsHtml;

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
        <p>${sanitizeText(getLocalizedNotes(k))}</p>
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
      if (this.onPredictionClick) {
        this.knowledgeEl.style.cursor = "pointer";
        this.knowledgeEl.setAttribute("role", "button");
        this.knowledgeEl.setAttribute("tabindex", "0");
        this.knowledgeEl.setAttribute(
          "aria-label",
          t("prediction.openDetailsAria", { species: top.label }),
        );
      }
    }
  }

  private renderCompareToolbar(): string {
    const activeClass = this.compareActive ? "compare-active" : "";
    const showBtn = this.compareActive
      ? `<button type="button" id="compare-show" class="compare-show" disabled>${t("comparison.show")}</button>`
      : "";
    return `
      <div class="compare-toolbar ${activeClass}">
        <button type="button" id="compare-toggle" class="compare-toggle" aria-pressed="${String(this.compareActive)}">
          ${t("comparison.toggle")}
        </button>
        ${showBtn}
      </div>
    `;
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
    const clickable = this.onPredictionClick ? "prediction-clickable" : "";
    const roleAttr = this.onPredictionClick ? 'role="button"' : "";
    const tabindexAttr = this.onPredictionClick ? 'tabindex="0"' : "";
    const ariaLabel = this.onPredictionClick
      ? sanitizeText(t("prediction.openDetailsAria", { species: item.label }))
      : "";
    const ariaAttr = ariaLabel ? `aria-label="${ariaLabel}"` : "";
    const checkbox = this.compareActive
      ? `<input type="checkbox" class="compare-checkbox" data-label="${sanitizeText(item.label)}" aria-label="${sanitizeText(t("comparison.selectAria", { species: item.label }))}" />`
      : "";

    return `
      <div class="prediction ${clickable}" data-label="${sanitizeText(item.label)}" ${roleAttr} ${tabindexAttr} ${ariaAttr}>
        ${checkbox}
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

  private bindPredictionClicks(): void {
    this.predictionsEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".compare-checkbox") || target.closest(".compare-toggle") || target.closest(".compare-show")) {
        return;
      }
      const prediction = target.closest("[data-label]");
      if (prediction && this.onPredictionClick) {
        const label = prediction.getAttribute("data-label");
        if (label) this.onPredictionClick(label);
      }
    });
    this.predictionsEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement;
      if (target.hasAttribute("data-label") && this.onPredictionClick) {
        const label = target.getAttribute("data-label");
        if (label) this.onPredictionClick(label);
        e.preventDefault();
      }
    });
    this.knowledgeEl.addEventListener("click", () => {
      const topLabel = this.knowledgeEl.querySelector("h3")?.textContent;
      if (topLabel && this.onPredictionClick) this.onPredictionClick(topLabel);
    });
    this.knowledgeEl.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && this.onPredictionClick) {
        const topLabel = this.knowledgeEl.querySelector("h3")?.textContent;
        if (topLabel) {
          this.onPredictionClick(topLabel);
          e.preventDefault();
        }
      }
    });
  }

  private bindComparisonControls(): void {
    this.predictionsEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const toggle = target.closest("#compare-toggle");
      if (toggle) {
        this.compareActive = !this.compareActive;
        this.selectedLabels.clear();
        this.refreshToolbar();
        this.emitComparisonChange();
        return;
      }
      const checkbox = target.closest(".compare-checkbox");
      if (checkbox instanceof HTMLInputElement) {
        const label = checkbox.getAttribute("data-label");
        if (!label) return;
        if (checkbox.checked) {
          if (this.selectedLabels.size >= this.maxCompare) {
            checkbox.checked = false;
            this.showMaxReached();
            return;
          }
          this.selectedLabels.add(label);
        } else {
          this.selectedLabels.delete(label);
        }
        this.updateShowButton();
        this.emitComparisonChange();
        return;
      }
      const showBtn = target.closest("#compare-show");
      if (showBtn) {
        this.onComparisonShow?.([...this.selectedLabels]);
      }
    });
  }

  private refreshToolbar(): void {
    const toolbar = this.predictionsEl.querySelector(".compare-toolbar");
    if (!toolbar) return;
    toolbar.outerHTML = this.renderCompareToolbar();
    this.updatePredictionCheckboxes();
  }

  private updatePredictionCheckboxes(): void {
    for (const row of this.predictionsEl.querySelectorAll(".prediction")) {
      const label = row.getAttribute("data-label");
      const existing = row.querySelector(".compare-checkbox");
      if (this.compareActive) {
        if (!existing) {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "compare-checkbox";
          checkbox.setAttribute("data-label", label ?? "");
          checkbox.setAttribute(
            "aria-label",
            sanitizeText(t("comparison.selectAria", { species: label ?? "" })),
          );
          checkbox.checked = this.selectedLabels.has(label ?? "");
          row.insertBefore(checkbox, row.firstChild);
        }
      } else {
        existing?.remove();
      }
    }
  }

  private updateShowButton(): void {
    const showBtn = this.predictionsEl.querySelector("#compare-show");
    if (!(showBtn instanceof HTMLButtonElement)) return;
    showBtn.disabled = this.selectedLabels.size < 2;
    showBtn.textContent = t("comparison.show", { count: String(this.selectedLabels.size) });
  }

  private emitComparisonChange(): void {
    this.onComparisonChange?.([...this.selectedLabels]);
  }

  private showMaxReached(): void {
    const toolbar = this.predictionsEl.querySelector(".compare-toolbar");
    if (!toolbar) return;
    let msg = toolbar.querySelector(".compare-max-msg");
    if (!msg) {
      msg = document.createElement("span");
      msg.className = "compare-max-msg";
      toolbar.appendChild(msg);
    }
    msg.textContent = t("comparison.maxReached", { max: String(this.maxCompare) });
    window.setTimeout(() => {
      msg.remove();
    }, 2000);
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
