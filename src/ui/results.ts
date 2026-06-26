import type { PredictionReport } from "@/inference/results";
import { Edibility } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";
import { sanitizeText } from "@/core/sanitize";
import { t } from "@/i18n";
import { getLocalizedNotes } from "@/i18n/knowledge";
import { createEl, hide, requireElement, show } from "@/ui/utils";

export interface ResultsRendererOptions {
  onPredictionClick?: (label: string) => void;
  onComparisonShow?: (labels: string[]) => void;
}

export class ResultsRenderer {
  private container: HTMLElement;
  private predictionsEl: HTMLElement;
  private knowledgeEl: HTMLElement;
  private warningEl: HTMLElement;
  private modelSelect: HTMLSelectElement;
  private onPredictionClick: ((label: string) => void) | undefined;
  private onComparisonShow: ((labels: string[]) => void) | undefined;
  private compareActive = false;
  private selectedLabels = new Set<string>();
  private readonly maxCompare = 3;

  constructor(root: HTMLElement, opts: ResultsRendererOptions = {}) {
    this.container = root;
    this.predictionsEl = requireElement("#predictions", this.container);
    this.knowledgeEl = requireElement("#knowledge", this.container);
    this.warningEl = requireElement("#warning", this.container);
    this.modelSelect = requireElement<HTMLSelectElement>(
      "#model-select",
      this.container,
    );
    this.onPredictionClick = opts.onPredictionClick;
    this.onComparisonShow = opts.onComparisonShow;
    this.bindModelSelector();
    this.bindPredictionClicks();
    this.bindComparisonControls();
  }

  clear(): void {
    this.predictionsEl.innerHTML = "";
    this.knowledgeEl.innerHTML = "";
    hide(this.knowledgeEl);
    hide(this.warningEl);
    this.compareActive = false;
    this.selectedLabels.clear();
  }

  render(report: PredictionReport, model: ModelRegistryEntry): void {
    this.clear();
    this.compareActive = false;
    this.selectedLabels.clear();

    if (report.requiresWarning && report.warningMessage) {
      this.warningEl.textContent = report.warningMessage;
      show(this.warningEl);
    }

    const toolbar = this.renderCompareToolbar();
    this.predictionsEl.appendChild(toolbar);
    for (const item of report.predictions) {
      this.predictionsEl.appendChild(this.renderPrediction(item, model));
    }

    const top = report.predictions[0];
    if (top) {
      const k = model.knowledge[top.label] ?? {
        edibility: Edibility.Unknown,
        notes: t("knowledge.noData"),
      };
      const verifyUrl = new URL("https://www.google.com/search");
      verifyUrl.searchParams.set("q", `${top.label} mushroom identification`);

      this.knowledgeEl.appendChild(createEl("h3", "", top.label));
      this.knowledgeEl.appendChild(
        createEl("p", "", getLocalizedNotes(k) || t("knowledge.noData")),
      );

      const verify = createEl(
        "a",
        "verify-link",
        t("prediction.verifyOnline"),
      ) as HTMLAnchorElement;
      verify.href = verifyUrl.toString();
      verify.target = "_blank";
      verify.rel = "noopener noreferrer";
      verify.setAttribute(
        "aria-label",
        t("prediction.verifyAriaLabel", { species: top.label }),
      );
      this.knowledgeEl.appendChild(verify);

      show(this.knowledgeEl);
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

  private renderCompareToolbar(): HTMLElement {
    const activeClass = this.compareActive ? "compare-active" : "";
    const toolbar = createEl(
      "div",
      `compare-toolbar ${activeClass}`.trim(),
      "",
    );

    const toggle = createEl(
      "button",
      "compare-toggle",
      t("comparison.toggle"),
    ) as HTMLButtonElement;
    toggle.id = "compare-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", String(this.compareActive));
    toolbar.appendChild(toggle);

    if (this.compareActive) {
      const showBtn = createEl(
        "button",
        "compare-show",
        t("comparison.show"),
      ) as HTMLButtonElement;
      showBtn.id = "compare-show";
      showBtn.type = "button";
      showBtn.disabled = true;
      toolbar.appendChild(showBtn);
    }

    return toolbar;
  }

  private renderPrediction(
    item: { label: string; probability: number },
    model: ModelRegistryEntry,
  ): HTMLElement {
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

    const row = createEl(
      "div",
      ["prediction", clickable].filter(Boolean).join(" "),
    );
    row.setAttribute("data-label", item.label);
    if (this.onPredictionClick) {
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute(
        "aria-label",
        t("prediction.openDetailsAria", { species: item.label }),
      );
    }

    if (this.compareActive) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "compare-checkbox";
      checkbox.setAttribute("data-label", item.label);
      checkbox.setAttribute(
        "aria-label",
        t("comparison.selectAria", { species: item.label }),
      );
      row.appendChild(checkbox);
    }

    const labelWrap = createEl("div", "label");
    labelWrap.appendChild(createEl("div", "prediction-name", item.label));
    labelWrap.appendChild(
      createEl("div", `prediction-edibility ${edClass}`, edText),
    );
    row.appendChild(labelWrap);

    const barWrap = createEl("div", "bar-wrap");
    const bar = createEl("div", "bar");
    bar.style.width = `${pct}%`;
    barWrap.appendChild(bar);
    row.appendChild(barWrap);

    row.appendChild(createEl("div", "pct", `${pct}%`));
    return row;
  }

  private bindPredictionClicks(): void {
    this.predictionsEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(".compare-checkbox") ||
        target.closest(".compare-toggle") ||
        target.closest(".compare-show")
      ) {
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
    toolbar.replaceWith(this.renderCompareToolbar());
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
    showBtn.textContent = t("comparison.show", {
      count: String(this.selectedLabels.size),
    });
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
    msg.textContent = t("comparison.maxReached", {
      max: String(this.maxCompare),
    });
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

}
