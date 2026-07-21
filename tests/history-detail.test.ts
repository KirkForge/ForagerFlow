import { describe, it, expect, beforeEach, vi } from "vitest";
import { HistoryDetailPanel } from "@/ui/history-detail";
import { setLocale } from "@/i18n";
import { makeHistoryEntry } from "./helpers/fixtures";

function renderDetailHTML(): void {
  document.body.innerHTML = `
    <dialog id="history-detail-modal" aria-labelledby="history-detail-title">
      <div id="history-detail-content">
        <div class="detail-header">
          <h2 id="history-detail-title"></h2>
          <button id="history-detail-close" type="button" value="close">×</button>
          <button id="history-detail-feedback" type="button">Feedback</button>
        </div>
        <div id="history-detail-body">
          <img id="history-detail-thumbnail" class="history-detail-thumbnail" alt="" hidden />
          <div id="history-detail-meta" class="detail-meta"></div>
          <p id="history-detail-notes" class="detail-notes"></p>
          <p id="history-detail-safety" class="detail-safety"></p>
          <a id="history-detail-verify" class="verify-link" href="#"></a>
        </div>
      </div>
    </dialog>
    <dialog id="feedback-modal">
      <form id="feedback-form">
        <input id="feedback-species" />
        <textarea id="feedback-notes"></textarea>
        <button id="feedback-cancel" type="button">Cancel</button>
        <button id="feedback-submit" type="submit">Submit</button>
      </form>
    </dialog>
  `;
  const dialog = document.querySelector(
    "#history-detail-modal",
  ) as HTMLDialogElement;
  dialog.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  dialog.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
}

describe("HistoryDetailPanel", () => {
  beforeEach(() => {
    setLocale("en");
    renderDetailHTML();
  });

  it("throws when required elements are missing", () => {
    document.body.innerHTML = "";
    expect(() => new HistoryDetailPanel()).toThrow(
      /HistoryDetailPanel: required element not found/,
    );
  });

  it("opens with species title, notes, edibility, and confidence", () => {
    const panel = new HistoryDetailPanel();
    panel.open(makeHistoryEntry({ top1Probability: 0.87 }));

    const modal = document.querySelector(
      "#history-detail-modal",
    ) as HTMLDialogElement;
    expect(modal.open).toBe(true);

    expect(document.querySelector("#history-detail-title")?.textContent).toBe(
      "Agaricus bisporus",
    );
    expect(document.querySelector("#history-detail-notes")?.textContent).toBe(
      "Safe.",
    );
    const meta = document.querySelector("#history-detail-meta") as HTMLElement;
    expect(meta.textContent).toContain("Edible");
    expect(meta.textContent).toContain("Confidence: 87.0%");
    expect(meta.textContent).toContain("Model: bvra");
  });

  it("renders thumbnail when available", () => {
    const panel = new HistoryDetailPanel();
    panel.open(
      makeHistoryEntry({
        thumbnail: "data:image/jpeg;base64,THUMBNAIL",
        top1Species: "Amanita muscaria",
      }),
    );

    const thumb = document.querySelector(
      "#history-detail-thumbnail",
    ) as HTMLImageElement;
    expect(thumb.hidden).toBe(false);
    expect(thumb.src).toContain("THUMBNAIL");
    expect(thumb.alt).toContain("Amanita muscaria");
  });

  it("hides thumbnail when missing", () => {
    const panel = new HistoryDetailPanel();
    panel.open(makeHistoryEntry({ thumbnail: "" }));

    const thumb = document.querySelector(
      "#history-detail-thumbnail",
    ) as HTMLImageElement;
    expect(thumb.hidden).toBe(true);
  });

  it("renders location when valid", () => {
    const panel = new HistoryDetailPanel();
    panel.open(
      makeHistoryEntry({
        location: { lat: 55.6761, lng: 12.5683 },
      }),
    );

    const meta = document.querySelector("#history-detail-meta") as HTMLElement;
    expect(meta.textContent).toContain("Location: 55.6761, 12.5683");
  });

  it("renders a verify link with a search URL", () => {
    const panel = new HistoryDetailPanel();
    panel.open(makeHistoryEntry({ top1Species: "Amanita phalloides" }));

    const link = document.querySelector(
      "#history-detail-verify",
    ) as HTMLAnchorElement;
    expect(link.href).toContain("google.com/search");
    expect(link.href).toContain("Amanita+phalloides+mushroom+identification");
  });

  it("closes when the close button is clicked", () => {
    const panel = new HistoryDetailPanel();
    panel.open(makeHistoryEntry());

    const closeBtn = document.querySelector(
      "#history-detail-close",
    ) as HTMLButtonElement;
    closeBtn.click();

    const modal = document.querySelector(
      "#history-detail-modal",
    ) as HTMLDialogElement;
    expect(modal.open).toBe(false);
  });

  it("closes when clicking the backdrop", () => {
    const panel = new HistoryDetailPanel();
    panel.open(makeHistoryEntry());

    const modal = document.querySelector(
      "#history-detail-modal",
    ) as HTMLDialogElement;
    modal.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 100,
      width: 200,
      height: 200,
    })) as unknown as typeof modal.getBoundingClientRect;

    modal.dispatchEvent(
      new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true }),
    );

    expect(modal.open).toBe(false);
  });

  it("renders Danish labels when locale is da", () => {
    setLocale("da");
    const panel = new HistoryDetailPanel();
    panel.open(makeHistoryEntry({ top1Probability: 0.76 }));

    const meta = document.querySelector("#history-detail-meta") as HTMLElement;
    expect(meta.textContent).toContain("Sikkerhed: 76.0%");
    expect(meta.textContent).toContain("Model: bvra");
  });
});
