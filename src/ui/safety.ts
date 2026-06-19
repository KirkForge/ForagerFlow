import { logger } from "@/core/logger";
import type { InferenceService } from "@/inference/service";
import { ModelKey } from "@/core/types";
import { modelRegistry } from "@/data/model-registry";

const SAFETY_ACK_KEY = "ff:safety-ack-v1";
const DIMA_CONFIRM_KEY = "ff:dima-confirm-v1";
const SAFETY_ACK_VERSION = "1";

interface SafetyUIOptions {
  inferenceService: InferenceService;
  onAcknowledged: () => void;
}

export class SafetyUI {
  private readonly opts: SafetyUIOptions;
  private readonly els: {
    safetyModal: HTMLDialogElement;
    safetyForm: HTMLFormElement;
    safetyAck: HTMLInputElement;
    safetyContinue: HTMLButtonElement;
    modelConfirmModal: HTMLDialogElement;
    modelConfirmAccept: HTMLButtonElement;
    modelConfirmCancel: HTMLButtonElement;
    storageConfirmModal: HTMLDialogElement;
    storageConfirmBody: HTMLElement;
    storageConfirmAccept: HTMLButtonElement;
    storageConfirmCancel: HTMLButtonElement;
    clearConfirmModal: HTMLDialogElement;
    clearConfirmAccept: HTMLButtonElement;
    clearConfirmCancel: HTMLButtonElement;
    modelSelect: HTMLSelectElement;
  };

  constructor(opts: SafetyUIOptions) {
    this.opts = opts;
    this.els = {
      safetyModal: this.req("#safety-modal"),
      safetyForm: this.req<HTMLFormElement>("#safety-form"),
      safetyAck: this.req<HTMLInputElement>("#safety-modal-ack"),
      safetyContinue: this.req<HTMLButtonElement>("#safety-modal-continue"),
      modelConfirmModal: this.req("#model-confirm-modal"),
      modelConfirmAccept: this.req<HTMLButtonElement>("#model-confirm-accept"),
      modelConfirmCancel: this.req<HTMLButtonElement>("#model-confirm-cancel"),
      storageConfirmModal: this.req("#storage-confirm-modal"),
      storageConfirmBody: this.req("#storage-confirm-body"),
      storageConfirmAccept: this.req<HTMLButtonElement>(
        "#storage-confirm-accept",
      ),
      storageConfirmCancel: this.req<HTMLButtonElement>(
        "#storage-confirm-cancel",
      ),
      clearConfirmModal: this.req("#clear-confirm-modal"),
      clearConfirmAccept: this.req<HTMLButtonElement>("#clear-confirm-accept"),
      clearConfirmCancel: this.req<HTMLButtonElement>("#clear-confirm-cancel"),
      modelSelect: this.req<HTMLSelectElement>("#model-select"),
    };
  }

  async init(): Promise<void> {
    this.bindSafetyModal();
    this.bindModelConfirm();
    this.bindStorageConfirmFromService();

    if (this.hasAcknowledged()) {
      this.applyCapabilityGate();
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
        this.els.safetyModal.removeEventListener("cancel", onCancel);
        this.els.safetyModal.close();
        this.applyCapabilityGate();
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
    return new Promise<boolean>((resolve) => {
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
      const cleanup = () => {
        this.els.clearConfirmAccept.removeEventListener("click", onAccept);
        this.els.clearConfirmCancel.removeEventListener("click", onCancel);
        this.els.clearConfirmModal.removeEventListener(
          "cancel",
          onDialogCancel,
        );
        this.els.clearConfirmModal.close();
      };
      this.els.clearConfirmAccept.addEventListener("click", onAccept, {
        once: true,
      });
      this.els.clearConfirmCancel.addEventListener("click", onCancel, {
        once: true,
      });
      this.els.clearConfirmModal.addEventListener("cancel", onDialogCancel, {
        once: true,
      });
      this.els.clearConfirmModal.showModal();
      this.els.clearConfirmCancel.focus();
    });
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

  private openModelConfirm(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const onAccept = () => {
        cleanup();
        this.markDima806Confirmed();
        this.els.modelSelect.value = ModelKey.Dima806;
        this.els.modelSelect.dispatchEvent(new Event("change"));
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
      const cleanup = () => {
        this.els.modelConfirmAccept.removeEventListener("click", onAccept);
        this.els.modelConfirmCancel.removeEventListener("click", onCancel);
        this.els.modelConfirmModal.removeEventListener(
          "cancel",
          onDialogCancel,
        );
        this.els.modelConfirmModal.close();
      };
      this.els.modelConfirmAccept.addEventListener("click", onAccept, {
        once: true,
      });
      this.els.modelConfirmCancel.addEventListener("click", onCancel, {
        once: true,
      });
      this.els.modelConfirmModal.addEventListener("cancel", onDialogCancel, {
        once: true,
      });
      this.els.modelConfirmModal.showModal();
      this.els.modelConfirmAccept.focus();
    });
  }

  private bindModelCapabilityGate(): void {
    const opt = this.els.modelSelect.querySelector<HTMLOptionElement>(
      `option[value="${ModelKey.Dima806}"]`,
    );
    if (!opt) return;

    const nav = navigator as unknown as {
      deviceMemory?: number;
      hardwareConcurrency?: number;
      connection?: { effectiveType?: string };
    };
    const lowMem = typeof nav.deviceMemory === "number" && nav.deviceMemory < 4;
    const lowCores =
      typeof nav.hardwareConcurrency === "number" &&
      nav.hardwareConcurrency < 4;
    const conn = nav.connection;
    const slowNet =
      !!conn &&
      typeof conn.effectiveType === "string" &&
      ["slow-2g", "2g", "3g"].includes(conn.effectiveType);

    if (lowMem || lowCores || slowNet) {
      opt.hidden = true;
      opt.disabled = true;
      if (this.els.modelSelect.value === "dima806") {
        this.els.modelSelect.value = ModelKey.BVRA;
      }
    }
  }

  private applyCapabilityGate(): void {
    this.bindModelCapabilityGate();
  }

  private bindStorageConfirmFromService(): void {
    this.opts.inferenceService.onStorageConfirm((payload) => {
      const freeMB = Math.round(payload.freeBytes / 1024 / 1024);
      const modelSize = modelRegistry[payload.modelKey].size;
      this.els.storageConfirmBody.textContent = `Your device reports ${String(freeMB)} MB of free storage. The selected model needs ${modelSize}. Continue anyway?`;
      const onAccept = () => {
        cleanup();
        this.opts.inferenceService.resumeStorageConfirm(payload.token);
      };
      const onCancel = () => {
        cleanup();
      };
      const onDialogCancel = (e: Event) => {
        e.preventDefault();
        onCancel();
      };
      const cleanup = () => {
        this.els.storageConfirmAccept.removeEventListener("click", onAccept);
        this.els.storageConfirmCancel.removeEventListener("click", onCancel);
        this.els.storageConfirmModal.removeEventListener(
          "cancel",
          onDialogCancel,
        );
        this.els.storageConfirmModal.close();
      };
      this.els.storageConfirmAccept.addEventListener("click", onAccept, {
        once: true,
      });
      this.els.storageConfirmCancel.addEventListener("click", onCancel, {
        once: true,
      });
      this.els.storageConfirmModal.addEventListener("cancel", onDialogCancel, {
        once: true,
      });
      this.els.storageConfirmModal.showModal();
      this.els.storageConfirmCancel.focus();
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private req<T extends HTMLElement>(sel: string): T {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`SafetyUI: required element not found: ${sel}`);
    return el as T;
  }
}
