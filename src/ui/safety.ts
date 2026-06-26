import { logger } from "@/core/logger";
import type { InferenceService } from "@/inference/service";
import { ModelKey } from "@/core/types";
import { modelRegistry } from "@/data/model-registry";
import { t } from "@/i18n";
import { requireElement } from "@/ui/utils";

const SAFETY_ACK_KEY = "ff:safety-ack-v1";
const DIMA_CONFIRM_KEY = "ff:dima-confirm-v1";
const SAFETY_ACK_VERSION = "1";

interface SafetyUIOptions {
  inferenceService: InferenceService;
  onAcknowledged: () => void;
}

interface ConfirmModalElements {
  modal: HTMLDialogElement;
  accept: HTMLButtonElement;
  cancel: HTMLButtonElement;
  defaultFocus: HTMLButtonElement;
}

export class SafetyUI {
  private readonly opts: SafetyUIOptions;
  private readonly els: {
    safetyModal: HTMLDialogElement;
    safetyForm: HTMLFormElement;
    safetyAck: HTMLInputElement;
    safetyContinue: HTMLButtonElement;
    modelConfirm: ConfirmModalElements;
    storageConfirm: ConfirmModalElements;
    clearConfirm: ConfirmModalElements;
    modelSelect: HTMLSelectElement;
  };

  constructor(opts: SafetyUIOptions) {
    this.opts = opts;
    this.els = {
      safetyModal: requireElement("#safety-modal", document, "SafetyUI"),
      safetyForm: requireElement<HTMLFormElement>(
        "#safety-form",
        document,
        "SafetyUI",
      ),
      safetyAck: requireElement<HTMLInputElement>(
        "#safety-modal-ack",
        document,
        "SafetyUI",
      ),
      safetyContinue: requireElement<HTMLButtonElement>(
        "#safety-modal-continue",
        document,
        "SafetyUI",
      ),
      modelConfirm: this.confirmEls("#model-confirm-modal"),
      storageConfirm: this.confirmEls("#storage-confirm-modal"),
      clearConfirm: this.confirmEls("#clear-confirm-modal"),
      modelSelect: requireElement<HTMLSelectElement>(
        "#model-select",
        document,
        "SafetyUI",
      ),
    };
  }

  async init(): Promise<void> {
    this.bindSafetyModal();
    this.bindModelConfirm();
    this.bindStorageConfirmFromService();

    if (this.hasAcknowledged()) {
      return;
    }

    this.els.safetyModal.showModal();
    this.els.safetyAck.focus();
    await new Promise<void>((resolve) => {
      const onSubmit = (e: SubmitEvent) => {
        if (!this.els.safetyAck.checked) {
          e.preventDefault();
          return;
        }
        try {
          localStorage.setItem(SAFETY_ACK_KEY, SAFETY_ACK_VERSION);
        } catch (err) {
          logger.warn("Could not persist safety acknowledgement:", err);
        }
        this.els.safetyModal.close();
        this.els.safetyModal.removeEventListener("cancel", onCancel);
        resolve();
      };
      const onCancel = (e: Event) => {
        // The modal is mandatory: ESC or backdrop click must not dismiss it.
        e.preventDefault();
      };
      this.els.safetyForm.addEventListener("submit", onSubmit, { once: true });
      this.els.safetyModal.addEventListener("cancel", onCancel);
    });

    this.opts.onAcknowledged();
  }

  confirmClearHistory(): Promise<boolean> {
    return this.showConfirmModal(this.els.clearConfirm);
  }

  private hasAcknowledged(): boolean {
    try {
      return localStorage.getItem(SAFETY_ACK_KEY) === SAFETY_ACK_VERSION;
    } catch {
      return false;
    }
  }

  private hasConfirmedDima806(): boolean {
    try {
      return localStorage.getItem(DIMA_CONFIRM_KEY) === "1";
    } catch {
      return false;
    }
  }

  private markDima806Confirmed(): void {
    try {
      localStorage.setItem(DIMA_CONFIRM_KEY, "1");
    } catch (err) {
      logger.warn("Could not persist dima806 confirmation:", err);
    }
  }

  private bindSafetyModal(): void {
    this.els.safetyAck.addEventListener("change", () => {
      this.els.safetyContinue.disabled = !this.els.safetyAck.checked;
    });
  }

  private bindModelConfirm(): void {
    this.els.modelSelect.addEventListener("change", (e) => {
      const select = e.target as HTMLSelectElement;
      if (select.value === "dima806" && !this.hasConfirmedDima806()) {
        select.value = ModelKey.BVRA;
        e.preventDefault();
        e.stopPropagation();
        void this.openModelConfirm();
        return;
      }
      if (select.value === "dima806") {
        this.markDima806Confirmed();
      }
    });
  }

  private async openModelConfirm(): Promise<boolean> {
    const accepted = await this.showConfirmModal(this.els.modelConfirm);
    if (accepted) {
      this.markDima806Confirmed();
      this.opts.inferenceService.preloadModel(ModelKey.Dima806);
      this.els.modelSelect.value = ModelKey.Dima806;
      this.els.modelSelect.dispatchEvent(new Event("change"));
    }
    return accepted;
  }

  private bindStorageConfirmFromService(): void {
    this.opts.inferenceService.onStorageConfirm((payload) => {
      const freeMB = Math.round(payload.freeBytes / 1024 / 1024);
      const modelSize = modelRegistry[payload.modelKey].size;
      const body = this.els.storageConfirm.modal.querySelector(
        "#storage-confirm-body",
      );
      if (body) {
        body.textContent = t("storageConfirm.body", {
          freeMB: String(freeMB),
          modelSize,
        });
      }
      void this.showConfirmModal(this.els.storageConfirm).then((accepted) => {
        if (accepted) {
          this.opts.inferenceService.resumeStorageConfirm();
        }
      });
    });
  }

  private showConfirmModal({
    modal,
    accept,
    cancel,
    defaultFocus,
  }: ConfirmModalElements): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const cleanup = () => {
        accept.removeEventListener("click", onAccept);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("cancel", onDialogCancel);
        modal.close();
      };
      const onAccept = () => {
        cleanup();
        resolve(true);
      };
      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      const onDialogCancel = (e: Event) => {
        e.preventDefault();
        onCancel();
      };

      accept.addEventListener("click", onAccept, { once: true });
      cancel.addEventListener("click", onCancel, { once: true });
      modal.addEventListener("cancel", onDialogCancel, { once: true });
      modal.showModal();
      defaultFocus.focus();
    });
  }

  private confirmEls(rootSelector: string): ConfirmModalElements {
    const root = requireElement<HTMLDialogElement>(
      rootSelector,
      document,
      "SafetyUI",
    );
    return {
      modal: root,
      accept: requireElement<HTMLButtonElement>(
        "[value='accept']",
        root,
        "SafetyUI",
      ),
      cancel: requireElement<HTMLButtonElement>(
        "[value='cancel'], button:not([value='accept'])",
        root,
        "SafetyUI",
      ),
      defaultFocus: requireElement<HTMLButtonElement>(
        "[value='cancel'], button:not([value='accept'])",
        root,
        "SafetyUI",
      ),
    };
  }
}
