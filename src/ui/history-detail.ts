import { Edibility } from "@/core/types";
import { sanitizeText } from "@/core/sanitize";
import { t } from "@/i18n";
import { isDataUrlThumbnail, isValidLocation } from "@/services/history";
import type { HistoryEntry } from "@/services/history";

export class HistoryDetailPanel {
  private readonly modal: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly thumbnail: HTMLImageElement;
  private readonly meta: HTMLElement;
  private readonly notes: HTMLParagraphElement;
  private readonly safety: HTMLParagraphElement;
  private readonly verify: HTMLAnchorElement;
  private readonly closeBtn: HTMLButtonElement;

  constructor(root: HTMLElement | Document = document) {
    this.modal = this.require("#history-detail-modal", root);
    this.title = this.require("#history-detail-title", root);
    this.thumbnail = this.require("#history-detail-thumbnail", root);
    this.meta = this.require("#history-detail-meta", root);
    this.notes = this.require("#history-detail-notes", root);
    this.safety = this.require("#history-detail-safety", root);
    this.verify = this.require("#history-detail-verify", root);
    this.closeBtn = this.require("#history-detail-close", root);
    this.bindClose();
    this.closeBtn.setAttribute("aria-label", t("history.detail.closeAria"));
  }

  open(entry: HistoryEntry): void {
    const label = entry.top1Species;
    this.title.textContent = sanitizeText(label);

    if (entry.thumbnail && isDataUrlThumbnail(entry.thumbnail)) {
      this.thumbnail.src = entry.thumbnail;
      this.thumbnail.alt = t("history.thumbnailAlt", { species: label });
      this.thumbnail.hidden = false;
    } else {
      this.thumbnail.src = "";
      this.thumbnail.alt = "";
      this.thumbnail.hidden = true;
    }

    const date = sanitizeText(new Date(entry.timestamp).toLocaleString());
    const model = sanitizeText(entry.modelKey);
    const edibilityClass = this.edibilityClass(entry.top1Edibility);
    const edibilityText = this.edibilityText(entry.top1Edibility);
    const prob = (entry.top1Probability * 100).toFixed(1);

    let metaHtml = `
      <span class="detail-edibility ${edibilityClass}">${edibilityText}</span>
      <span class="detail-confidence">${t("history.detail.confidence", { prob })}</span>
      <span class="history-detail-date">${t("history.detail.date", { date })}</span>
      <span class="history-detail-model">${t("history.detail.model", { model })}</span>
    `;

    if (entry.location && isValidLocation(entry.location)) {
      const { lat, lng } = entry.location;
      metaHtml += `<a class="history-detail-location" target="_blank" rel="noopener" href="geo:${String(lat)},${String(lng)}?q=${String(lat)},${String(lng)}">${t("history.detail.location", { lat: lat.toFixed(4), lng: lng.toFixed(4) })}</a>`;
    }

    this.meta.innerHTML = metaHtml;

    this.notes.textContent = entry.notes
      ? sanitizeText(entry.notes)
      : t("knowledge.noData");
    this.safety.textContent = t("detail.safetyReminder");

    const verifyUrl = new URL("https://www.google.com/search");
    verifyUrl.searchParams.set("q", `${label} mushroom identification`);
    this.verify.href = verifyUrl.toString();
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
    this.thumbnail.src = "";
    this.thumbnail.hidden = true;
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private require<T extends HTMLElement>(
    sel: string,
    root: HTMLElement | Document,
  ): T {
    const el = root.querySelector(sel);
    if (!el) {
      throw new Error(`HistoryDetailPanel: required element not found: ${sel}`);
    }
    return el as T;
  }
}
