import { describe, it, expect, beforeEach, vi } from "vitest";
import { SpeciesDetailPanel } from "@/ui/species-detail";
import { Edibility } from "@/core/types";
import { setLocale } from "@/i18n";

function makeConfidence(
  score: number,
  reliability: "high" | "medium" | "low",
  gap: number,
) {
  return { score, reliability, gap };
}

function renderDetailHTML(): void {
  document.body.innerHTML = `
    <dialog id="species-detail-modal" aria-labelledby="species-detail-title">
      <div id="species-detail-content">
        <div class="detail-header">
          <h2 id="species-detail-title"></h2>
          <button id="species-detail-close" type="button" value="close">×</button>
        </div>
        <div id="species-detail-body">
          <div id="species-detail-meta" class="detail-meta"></div>
          <p id="species-detail-notes" class="detail-notes"></p>
          <p id="species-detail-safety" class="detail-safety"></p>
          <a id="species-detail-verify" class="verify-link" href="#"></a>
        </div>
      </div>
    </dialog>
  `;
  const dialog = document.querySelector(
    "#species-detail-modal",
  ) as HTMLDialogElement;
  dialog.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  dialog.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
}

describe("SpeciesDetailPanel", () => {
  beforeEach(() => {
    setLocale("en");
    renderDetailHTML();
  });

  it("throws when required elements are missing", () => {
    document.body.innerHTML = "";
    expect(() => new SpeciesDetailPanel()).toThrow(
      /SpeciesDetailPanel: required element not found/,
    );
  });

  it("opens with species title, notes, edibility, and confidence", () => {
    const panel = new SpeciesDetailPanel();
    panel.open(
      "Agaricus bisporus",
      { label: "Agaricus bisporus", probability: 0.87, index: 0 },
      { edibility: Edibility.Edible, notes: "Safe button mushroom." },
      makeConfidence(0.91, "high", 0.85),
    );

    const modal = document.querySelector(
      "#species-detail-modal",
    ) as HTMLDialogElement;
    expect(modal.open).toBe(true);

    expect(document.querySelector("#species-detail-title")?.textContent).toBe(
      "Agaricus bisporus",
    );
    expect(document.querySelector("#species-detail-notes")?.textContent).toBe(
      "Safe button mushroom.",
    );
    expect(
      document.querySelector("#species-detail-meta")?.textContent,
    ).toContain("Edible");
    expect(
      document.querySelector("#species-detail-meta")?.textContent,
    ).toContain("87.0%");
    expect(
      document.querySelector("#species-detail-meta")?.textContent,
    ).toContain("High reliability");
  });

  it("renders a verify link with a search URL", () => {
    const panel = new SpeciesDetailPanel();
    panel.open(
      "Amanita phalloides",
      { label: "Amanita phalloides", probability: 0.45, index: 1 },
      { edibility: Edibility.Poisonous, notes: "Death cap — fatal." },
      makeConfidence(0.42, "low", 0.2),
    );

    const link = document.querySelector(
      "#species-detail-verify",
    ) as HTMLAnchorElement;
    expect(link.href).toContain("google.com/search");
    expect(link.href).toContain("Amanita+phalloides+mushroom+identification");
    expect(link.target).toBe("_blank");
  });

  it("closes when the close button is clicked", () => {
    const panel = new SpeciesDetailPanel();
    panel.open(
      "Russula emetica",
      { label: "Russula emetica", probability: 0.2, index: 2 },
      { edibility: Edibility.Poisonous, notes: "Sickener." },
      makeConfidence(0.18, "low", 0.05),
    );

    const closeBtn = document.querySelector(
      "#species-detail-close",
    ) as HTMLButtonElement;
    closeBtn.click();

    const modal = document.querySelector(
      "#species-detail-modal",
    ) as HTMLDialogElement;
    expect(modal.open).toBe(false);
  });

  it("closes when clicking the backdrop", () => {
    const panel = new SpeciesDetailPanel();
    panel.open(
      "Agaricus bisporus",
      { label: "Agaricus bisporus", probability: 0.9, index: 0 },
      { edibility: Edibility.Edible, notes: "Safe." },
      makeConfidence(0.88, "high", 0.8),
    );

    const modal = document.querySelector(
      "#species-detail-modal",
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

  it("falls back to no-data notes when knowledge is empty", () => {
    const panel = new SpeciesDetailPanel();
    panel.open(
      "Unknown species",
      { label: "Unknown species", probability: 0.5, index: -1 },
      { edibility: Edibility.Unknown, notes: "" },
      makeConfidence(0.5, "medium", 0),
    );

    expect(document.querySelector("#species-detail-notes")?.textContent).toBe(
      "No data available.",
    );
  });

  it("renders poisonous edibility and low reliability in Danish", () => {
    setLocale("da");
    const panel = new SpeciesDetailPanel();
    panel.open(
      "Amanita phalloides",
      { label: "Amanita phalloides", probability: 0.6, index: 1 },
      {
        edibility: Edibility.Poisonous,
        notes: "Hvid fluesvamp — dødelig.",
        localizedNotes: { da: "Dødeligt giftig." },
      },
      makeConfidence(0.42, "low", 0.2),
    );

    const meta = document.querySelector("#species-detail-meta") as HTMLElement;
    expect(meta.textContent).toContain("GIFTIG");
    expect(meta.textContent).toContain("Lav pålidelighed");
    expect(document.querySelector("#species-detail-notes")?.textContent).toBe(
      "Dødeligt giftig.",
    );
  });
});
