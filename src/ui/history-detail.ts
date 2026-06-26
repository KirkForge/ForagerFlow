import { Edibility } from "@/core/types";
import { t } from "@/i18n";
import { isDataUrlThumbnail, isValidLocation } from "@/services/history";
import type { HistoryEntry } from "@/services/history";
import { createEl, requireElement } from "@/ui/utils";

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
    this.modal = requireElement("#history-detail-modal", root, "HistoryDetailPanel");
    this.title = requireElement("#history-detail-title", root, "HistoryDetailPanel");
    this.thumbnail = requireElement("#history-detail-thumbnail", root, "HistoryDetailPanel");
    this.meta = requireElement("#history-detail-meta", root, "HistoryDetailPanel");
    this.notes = requireElement("#history-detail-notes", root, "HistoryDetailPanel");
    this.safety = requireElement("#history-detail-safety", root, "HistoryDetailPanel");
    this.verify = requireElement("#history-detail-verify", root, "HistoryDetailPanel");
    this.closeBtn = requireElement("#history-detail-close", root, "HistoryDetailPanel");
    this.bindClose();
    this.closeBtn.setAttribute("aria-label", t("history.detail.closeAria"));
  }

  open(entry: HistoryEntry): void {
    const label = entry.top1Species;
    this.title.textContent = label;

    if (entry.thumbnail && isDataUrlThumbnail(entry.thumbnail)) {
      this.thumbnail.src = entry.thumbnail;
      this.thumbnail.alt = t("history.thumbnailAlt", { species: label });
      this.thumbnail.hidden = false;
    } else {
      this.thumbnail.src = "";
      this.thumbnail.alt = "";
      this.thumbnail.hidden = true;
    }

    const date = new Date(entry.timestamp).toLocaleString();
    const model = entry.modelKey;
    const edibilityClass = this.edibilityClass(entry.top1Edibility);
    const edibilityText = this.edibilityText(entry.top1Edibility);
    const prob = (entry.top1Probability * 100).toFixed(1);

    this.meta.innerHTML = "";
    this.meta.appendChild(
      createEl("span", `detail-edibility ${edibilityClass}`, edibilityText),
    );
    this.meta.appendChild(
      createEl(
        "span",
        "detail-confidence",
        t("history.detail.confidence", { prob }),
      ),
    );
    this.meta.appendChild(
      createEl(
        "span",
        "history-detail-date",
        t("history.detail.date", { date }),
      ),
    );
    this.meta.appendChild(
      createEl(
        "span",
        "history-detail-model",
        t("history.detail.model", { model }),
      ),
    );

    if (entry.location && isValidLocation(entry.location)) {
      const { lat, lng } = entry.location;
      const locationLink = createEl(
        "a",
        "history-detail-location",
        t("history.detail.location", {
          lat: lat.toFixed(4),
          lng: lng.toFixed(4),
        }),
      ) as HTMLAnchorElement;
      locationLink.href = `geo:${String(lat)},${String(lng)}?q=${String(lat)},${String(lng)}`;
      locationLink.target = "_blank";
      locationLink.rel = "noopener";
      this.meta.appendChild(locationLink);
    }

    this.notes.textContent = entry.notes ? entry.notes : t("knowledge.noData");
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

}
