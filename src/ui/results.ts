import type { PredictionReport } from "@/inference/results";
import { Edibility } from "@/core/types";
import type { ModelRegistryEntry } from "@/core/types";

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
    this.predictionsEl.replaceChildren();
    this.knowledgeEl.replaceChildren();
    this.knowledgeEl.style.display = "none";
    this.warningEl.style.display = "none";
  }

  render(report: PredictionReport, model: ModelRegistryEntry): void {
    this.clear();

    if (report.requiresWarning && report.warningMessage) {
      this.warningEl.textContent = report.warningMessage;
      this.warningEl.style.display = "block";
    }

    report.predictions.forEach((item, rank) => {
      const k = model.knowledge[item.label] ?? {
        edibility: Edibility.Unknown,
        notes: "No data available.",
      };
      const pct = (item.probability * 100).toFixed(1);
      const isPoison = k.edibility === Edibility.Poisonous;
      const isUnknown = k.edibility === Edibility.Unknown;
      const edClass = isPoison ? "poisonous" : isUnknown ? "unknown" : "edible";
      const edText = isPoison ? "POISONOUS" : isUnknown ? "Unknown" : "Edible";

      const div = document.createElement("div");
      div.className = "prediction";

      const labelDiv = document.createElement("div");
      labelDiv.className = "label";

      const nameDiv = document.createElement("div");
      nameDiv.style.fontWeight = "600";
      nameDiv.textContent = item.label;

      const edDiv = document.createElement("div");
      edDiv.className = edClass;
      edDiv.style.fontSize = "11px";
      edDiv.style.marginTop = "2px";
      edDiv.textContent = edText;

      labelDiv.appendChild(nameDiv);
      labelDiv.appendChild(edDiv);

      const barWrap = document.createElement("div");
      barWrap.className = "bar-wrap";

      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.width = `${pct}%`;

      barWrap.appendChild(bar);

      const pctDiv = document.createElement("div");
      pctDiv.className = "pct";
      pctDiv.textContent = `${pct}%`;

      div.appendChild(labelDiv);
      div.appendChild(barWrap);
      div.appendChild(pctDiv);
      this.predictionsEl.appendChild(div);

      if (rank === 0) {
        const h3 = document.createElement("h3");
        h3.textContent = item.label;

        const p = document.createElement("p");
        p.textContent = k.notes;

        // Verify-this-species link: a one-tap escape hatch from the
        // sandboxed CSP-isolated app to a real search engine. The
        // species name is sanitized via encodeURIComponent and the
        // URL is built with the URL constructor so an attacker
        // cannot inject a different host into the link target.
        const verify = document.createElement("a");
        verify.className = "verify-link";
        verify.textContent = "Verify this species online →";
        verify.setAttribute(
          "aria-label",
          `Verify ${item.label} online (opens in new tab)`,
        );
        verify.target = "_blank";
        verify.rel = "noopener noreferrer";
        const verifyUrl = new URL("https://www.google.com/search");
        verifyUrl.searchParams.set(
          "q",
          `${item.label} mushroom identification`,
        );
        verify.href = verifyUrl.toString();

        this.knowledgeEl.innerHTML = "";
        this.knowledgeEl.appendChild(h3);
        this.knowledgeEl.appendChild(p);
        this.knowledgeEl.appendChild(verify);
        this.knowledgeEl.style.display = "block";
      }
    });
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
