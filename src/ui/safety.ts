// ui/safety.ts
//
// All the safety-critical modal logic lives here. main.ts instantiates
// SafetyUI once and the SafetyUI owns every <dialog> in index.html.
//
// Why a separate module:
//   - The first-run modal, model-picker confirm, and storage confirm
//     are independent of the camera/inference flow and would crowd
//     AppController.
//   - localStorage keys are versioned (`v1` suffix) so a future
//     change to the safety copy forces a re-acknowledgement.
//   - All the DOM IDs that index.html exposes for the safety UI are
//     referenced from exactly one place.

import { logger } from "@/core/logger";
import type { InferenceService } from "@/inference/service";
import { ModelKey } from "@/core/types";

const SAFETY_ACK_KEY = "ff:safety-ack-v1";
const DIMA_CONFIRM_KEY = "ff:dima-confirm-v1";
// Increment this if the safety copy changes materially; the user will
// be re-prompted on next load.
const SAFETY_ACK_VERSION = "1";

interface SafetyUIOptions {
  inferenceService: InferenceService;
  onAcknowledged: () => void;
}

export class SafetyUI {
  private readonly opts: SafetyUIOptions;
  // Cached element references — index.html is the source of truth.
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

  /**
   * Wire all safety-UI event handlers. Call once on app init.
   * Returns a Promise that resolves when the user has acknowledged
   * the first-run safety modal (or has already done so in a previous
   * session).
   */
  async init(): Promise<void> {
    this.bindSafetyModal();
    this.bindModelConfirm();
    this.bindStorageConfirm();
    this.bindClearConfirm();
    this.bindModelCapabilityGate();
    this.bindStorageConfirmFromService();

    if (this.hasAcknowledged()) {
      // Apply capability gating immediately so the dropdown is in
      // the right state before the user sees it.
      this.applyCapabilityGate();
      return;
    }

    // First run. Show the modal, wait for acknowledgement.
    this.els.safetyModal.showModal();
    await new Promise<void>((resolve) => {
      this.els.safetyForm.addEventListener(
        "submit",
        (e) => {
          if (!this.els.safetyAck.checked) {
            e.preventDefault();
            return;
          }
          try {
            localStorage.setItem(
              SAFETY_ACK_KEY,
              SAFETY_ACK_VERSION,
            );
          } catch (err) {
            logger.warn("Could not persist safety acknowledgement:", err);
          }
          this.els.safetyModal.close();
          this.applyCapabilityGate();
          resolve();
        },
        { once: true },
      );
    });

    this.opts.onAcknowledged();
  }

  /**
   * Public: open the clear-history confirm. Returns a Promise that
   * resolves to `true` if the user confirmed, `false` if cancelled.
   */
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
      // The native <dialog> element fires a "cancel" event when the
      // user dismisses it via ESC or by clicking the backdrop. The
      // accept/cancel button click handlers don't fire in that case,
      // so without this listener the Promise would never resolve and
      // the listeners above would leak.
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
    });
  }

  private hasAcknowledged(): boolean {
    try {
      return localStorage.getItem(SAFETY_ACK_KEY) === SAFETY_ACK_VERSION;
    } catch {
      // localStorage can throw in private mode; treat as un-acked.
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
      // <select>.value is a plain string; ModelKey is an enum. Compare
      // via the string literal the enum value resolves to so the lint
      // rule about mixed-enum comparisons is satisfied.
      if (select.value === "dima806" && !this.hasConfirmedDima806()) {
        // Reset to bvra; we'll only commit the change after the
        // user accepts the modal.
        select.value = "bvra";
        e.preventDefault();
        e.stopPropagation();
        void this.openModelConfirm();
        return;
      }
      // First time after they accept, persist so we never ask again.
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
      // <dialog> cancel event: ESC or backdrop click dismisses the
      // modal without firing the cancel button. Without this handler
      // the Promise hangs forever and the listeners above leak.
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
    });
  }

  private bindStorageConfirm(): void {
    // No-op binding placeholder. Storage confirm is driven by the
    // inference service's `storageConfirm` event below.
  }

  private bindClearConfirm(): void {
    // The accept/cancel buttons are wired per-confirm in
    // confirmClearHistory(). Nothing to bind here at init.
  }

  private bindModelCapabilityGate(): void {
    // Hide dima806 entirely on devices that report
    //   navigator.deviceMemory < 4 || navigator.hardwareConcurrency < 4
    //   || connection.effectiveType in {2g,3g,slow-2g}
    // The first two are real failure modes (insufficient RAM / CPU
    // for a 330 MB model). The third is a UX hint: don't show the
    // user a download that will take 10 minutes on EDGE.
    const opt = this.els.modelSelect.querySelector<HTMLOptionElement>(
      'option[value="dima806"]',
    );
    if (!opt) return;

    // navigator.deviceMemory is non-standard (Chrome only); cast to
    // unknown then narrow to avoid the DOM lib complaining.
    const nav = navigator as unknown as {
      deviceMemory?: number;
      hardwareConcurrency?: number;
      connection?: { effectiveType?: string };
    };
    const lowMem =
      typeof nav.deviceMemory === "number" && nav.deviceMemory < 4;
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
      // If the current value is the hidden one, fall back to bvra.
      if (this.els.modelSelect.value === "dima806") {
        this.els.modelSelect.value = "bvra";
      }
    }
  }

  private applyCapabilityGate(): void {
    this.bindModelCapabilityGate();
  }

  private bindStorageConfirmFromService(): void {
    this.opts.inferenceService.on("storageConfirm", (payload) => {
      const freeMB = Math.round(payload.freeBytes / 1024 / 1024);
      this.els.storageConfirmBody.textContent = `Your device reports ${String(freeMB)} MB of free storage. The selected model needs ~330 MB. Continue anyway?`;
      const onAccept = () => {
        cleanup();
        this.opts.inferenceService.resumeStorageConfirm(payload.token);
      };
      const onCancel = () => {
        cleanup();
        // Do NOT resume the load — the inference service keeps the
        // pending token alive and will retry on the next model
        // switch. Closing without resuming is the documented cancel
        // behavior.
      };
      // <dialog> cancel event: ESC/backdrop dismisses without
      // clicking the cancel button. Without this handler the
      // listeners above leak and the modal stays in the
      // half-cancelled state.
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
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private req<T extends HTMLElement>(sel: string): T {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`SafetyUI: required element not found: ${sel}`);
    return el as T;
  }
}
