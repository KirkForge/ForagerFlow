import { requireElement } from "@/ui/utils";
import type { HistoryEntry, FeedbackEntry } from "@/services/history";

export class FeedbackPanel {
  private readonly modal: HTMLDialogElement;
  private readonly form: HTMLFormElement;
  private readonly speciesInput: HTMLInputElement;
  private readonly notesInput: HTMLTextAreaElement;
  private readonly cancelBtn: HTMLButtonElement;
  private entryId: string | null = null;
  private onSubmit: ((id: string, feedback: FeedbackEntry) => void) | null =
    null;

  constructor(root: HTMLElement | Document = document) {
    this.modal = requireElement("#feedback-modal", root, "FeedbackPanel");
    this.form = requireElement("#feedback-form", root, "FeedbackPanel");
    this.speciesInput = requireElement<HTMLInputElement>(
      "#feedback-species",
      root,
      "FeedbackPanel",
    );
    this.notesInput = requireElement<HTMLTextAreaElement>(
      "#feedback-notes",
      root,
      "FeedbackPanel",
    );
    this.cancelBtn = requireElement<HTMLButtonElement>(
      "#feedback-cancel",
      root,
      "FeedbackPanel",
    );
    this.bindEvents();
  }

  open(
    entry: HistoryEntry,
    onSubmit: (id: string, feedback: FeedbackEntry) => void,
  ): void {
    this.entryId = entry.id;
    this.onSubmit = onSubmit;
    this.speciesInput.value = entry.top1Species;
    this.notesInput.value = "";
    this.modal.showModal();
    this.speciesInput.focus();
  }

  close(): void {
    if (this.modal.open) {
      this.modal.close();
    }
    this.entryId = null;
    this.onSubmit = null;
  }

  private bindEvents(): void {
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!this.entryId || !this.onSubmit) return;
      const correctSpecies = this.speciesInput.value.trim();
      if (!correctSpecies) return;
      this.onSubmit(this.entryId, {
        correctSpecies,
        notes: this.notesInput.value.trim(),
        timestamp: new Date().toISOString(),
      });
      this.close();
    });

    this.cancelBtn.addEventListener("click", () => {
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
}
