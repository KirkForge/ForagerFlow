import { ModelKey, ApplicationState } from "@/core/types";
import { inferenceService } from "@/inference/service";
import { CameraService } from "@/services/camera";
import { processFileInput } from "@/services/image-input";
import { registerServiceWorker, updateOnlineStatus } from "@/services/connectivity";
import { generatePredictionReport } from "@/inference/results";
import { modelRegistry } from "@/data/model-registry";
import { ResultsRenderer, SafetyUI } from "@/ui";
import {
  saveIdentification,
  getHistory,
  clearHistory,
  type HistoryEntry,
} from "@/services/history";
import { initWebVitals } from "@/services/web-vitals";
import { logger } from "@/core/logger";
import { sanitizeText } from "@/core/sanitize";

function getEdibilityClass(ed: string): string {
  if (ed === "Poisonous") return "edibility-poisonous";
  if (ed === "Edible") return "edibility-edible";
  return "edibility-unknown";
}

class AppController {
  private camera = new CameraService(224);
  private renderer: ResultsRenderer;
  private safety!: SafetyUI;
  private statusEl: HTMLElement;
  private badgeEl: HTMLElement;
  private videoEl: HTMLVideoElement;
  private captureBtn: HTMLButtonElement;
  private cameraErrorEl: HTMLElement;
  private fileFallbackBtn: HTMLButtonElement | null = null;
  private fileInputEl: HTMLInputElement | null = null;
  #appState: ApplicationState = ApplicationState.Loading;

  constructor() {
    this.statusEl = this.require("#status");
    this.badgeEl = this.require("#badge");
    this.videoEl = this.require("#video") as unknown as HTMLVideoElement;
    this.captureBtn = this.require("#capture-btn") as unknown as HTMLButtonElement;
    this.cameraErrorEl = this.require("#camera-error");
    this.fileFallbackBtn = document.querySelector<HTMLButtonElement>(
      "#file-fallback-btn",
    );
    this.fileInputEl = document.querySelector<HTMLInputElement>("#file-input");
    this.renderer = new ResultsRenderer(this.require("#app"));
  }

  async init(): Promise<void> {
    this.setState(ApplicationState.Loading);
    registerServiceWorker();
    initWebVitals();
    this.bindEvents();
    updateOnlineStatus(this.badgeEl);

    inferenceService.initialize();

    // SafetyUI is constructed first because the storage-confirm modal
    // listens for inferenceService.on("storageConfirm", ...). The
    // init() promise blocks until the user has acknowledged the
    // first-run modal (or has already done so in a previous session).
    this.safety = new SafetyUI({
      inferenceService,
      onAcknowledged: () => {
        logger.debug("Safety acknowledgement recorded");
      },
    });

    inferenceService.on("status", (text: string) => {
      this.statusEl.textContent = text;
      if (text === "Processing...") {
        this.setState(ApplicationState.Processing);
      }
    });

    inferenceService.on("result", ({ logits, modelKey }) => {
      const model = modelRegistry[modelKey];
      const report = generatePredictionReport(logits, model);
      this.setState(ApplicationState.Done);
      this.renderer.render(report, model);
      this.setCaptureBusy(false);
      saveIdentification(report, modelKey).catch((_e: unknown) => { /* best-effort save */ });
      void this.renderHistory();
    });

    inferenceService.on("error", (error) => {
      this.statusEl.textContent = `Error: ${error.message}`;
      this.setCaptureBusy(false);
      this.setState(ApplicationState.CameraError);
    });

    // Block app initialization on the first-run safety modal so we
    // don't show the camera (and the model-select) before the user
    // has been told this is not a safety oracle.
    await this.safety.init();

    await this.startCamera();
    void this.renderHistory();
    void this.renderLastResult();
    inferenceService.switchModel(ModelKey.BVRA);
  }

  private async startCamera(): Promise<void> {
    try {
      await this.camera.start(this.videoEl);
      this.statusEl.textContent = "Camera active. Tap shutter to identify.";
      this.cameraErrorEl.style.display = "none";
      this.setState(ApplicationState.CameraActive);
    } catch {
      this.statusEl.textContent = "Camera error. Try file input.";
      this.cameraErrorEl.style.display = "flex";
      this.setState(ApplicationState.CameraError);
    }
  }

  private handleCapture(): void {
    if (this.captureBtn.dataset["busy"] === "true") return; // debounce
    const result = this.camera.capture();
    if (!result) return;
    this.setCaptureBusy(true);
    this.statusEl.textContent = "Identifying…";
    inferenceService.infer(result.buffer, result.width, result.height);
  }

  /**
   * Toggles the visible busy state on the capture button. The
   * button is disabled while busy so a wet thumb cannot double-fire.
   * The CSS [data-busy="true"] rule renders a spinner overlay.
   */
  private setCaptureBusy(busy: boolean): void {
    this.captureBtn.dataset["busy"] = busy ? "true" : "false";
    this.captureBtn.disabled = busy;
    this.captureBtn.setAttribute("aria-busy", busy ? "true" : "false");
  }

  private async handleFileSelect(
    e: Event,
  ): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const { buffer, width, height } = await processFileInput(file);
      this.setCaptureBusy(true);
      this.statusEl.textContent = "Identifying…";
      inferenceService.infer(buffer, width, height);
    } catch (err) {
      logger.error("File processing failed:", err);
      this.statusEl.textContent = "Failed to process image.";
    }
  }

  private handleRetryCamera(): void {
    void this.startCamera();
  }

  private handleModelSwitch(e: Event): void {
    const select = e.target as HTMLSelectElement;
    // SafetyUI has already gated the dropdown for capability and
    // first-use confirmation. If the value made it through, switch.
    const key =
      select.value === "dima806"
        ? ModelKey.Dima806
        : ModelKey.BVRA;
    this.renderer.clear();
    inferenceService.switchModel(key);
  }

  handleOfflineChange(): void {
    updateOnlineStatus(this.badgeEl);
  }

  /**
   * Renders the most recent history entry as a "last seen" callout
   * above the camera viewfinder so a returning user can verify a
   * species they identified earlier without scrolling. Skips if
   * there is no history. Rendered into the #status area because
   * that is the only always-visible slot before the camera; the
   * results panel sits below the camera and would require scroll
   * to reach on a phone.
   */
  private async renderLastResult(): Promise<void> {
    const entries = await getHistory(1);
    const last = entries[0];
    if (!last) return;
    const date = sanitizeText(new Date(last.timestamp).toLocaleString());
    const species = sanitizeText(last.top1Species);
    const edibility = sanitizeText(last.top1Edibility);
    const prob = (last.top1Probability * 100).toFixed(1);
    const edClass = getEdibilityClass(last.top1Edibility);
    const slot = document.getElementById("last-result");
    if (!slot) return;
    slot.innerHTML = `
      <div class="last-result-inner">
        <div class="last-result-label">Last identification</div>
        <div class="last-result-species">${species}</div>
        <div class="last-result-meta">
          <span class="history-edibility ${edClass}">${edibility}</span>
          <span class="last-result-prob">${prob}%</span>
          <span class="last-result-date">${date}</span>
        </div>
      </div>
    `;
    slot.style.display = "block";
  }

  private async renderHistory(): Promise<void> {
    const list = document.getElementById("history-list");
    if (!list) return;
    try {
      const entries = await getHistory(20);
      if (entries.length === 0) {
        list.innerHTML = '<p class="history-empty">No past identifications yet.</p>';
        return;
      }
      list.innerHTML = entries
        .map((e: HistoryEntry) => {
          const date = sanitizeText(new Date(e.timestamp).toLocaleDateString());
          const model = sanitizeText(e.modelKey);
          const species = sanitizeText(e.top1Species);
          const edibility = sanitizeText(e.top1Edibility);
          const prob = (e.top1Probability * 100).toFixed(1);
          const id = sanitizeText(e.id);
          const edClass = getEdibilityClass(e.top1Edibility);
          return `<div class="history-entry">
          <div class="history-meta">
            <span class="history-date">${date}</span>
            <span class="history-model">${model}</span>
            <span class="history-edibility ${edClass}">${edibility}</span>
          </div>
          <div class="history-name">${species}</div>
          <div class="history-prob">${prob}% confidence</div>
          <button class="history-delete" data-id="${id}" aria-label="Delete this entry">&times;</button>
        </div>`;
        })
        .join("");

      list.querySelectorAll(".history-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          void (async () => {
            const id = (btn as HTMLElement).dataset["id"];
            if (!id) return;
            const { deleteEntry } = await import(
              /* @vite-ignore */ "@/services/history/delete-entry"
            );
            await deleteEntry(id);
            void this.renderHistory();
            void this.renderLastResult();
          })();
        });
      });
    } catch {
      list.innerHTML = "<p>Unable to load history.</p>";
    }
  }

  private async handleClearHistory(): Promise<void> {
    const confirmed = await this.safety.confirmClearHistory();
    if (!confirmed) return;
    await clearHistory();
    void this.renderHistory();
    void this.renderLastResult();
  }

  private bindEvents(): void {
    this.captureBtn.addEventListener("click", () => {
      this.handleCapture();
    });

    this.fileInputEl?.addEventListener("change", (e) => {
      void this.handleFileSelect(e);
    });

    // The file-fallback button programmatically clicks the hidden
    // file input. This is more phone-friendly than a <label> that
    // requires the input to be visible next to it (which doesn't
    // happen on landscape phones).
    this.fileFallbackBtn?.addEventListener("click", () => {
      this.fileInputEl?.click();
    });

    const clearBtn = document.getElementById("history-clear");
    clearBtn?.addEventListener("click", () => {
      void this.handleClearHistory();
    });

    const retryBtn = document.getElementById("camera-retry");
    retryBtn?.addEventListener("click", () => {
      this.handleRetryCamera();
    });

    const modelSelect = document.getElementById("model-select");
    modelSelect?.addEventListener("change", (e) => {
      this.handleModelSwitch(e);
    });

    window.addEventListener("online", () => {
      this.handleOfflineChange();
    });
    window.addEventListener("offline", () => {
      this.handleOfflineChange();
    });
  }

  private require(selector: string): HTMLElement {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Required element not found: ${selector}`);
    return el as HTMLElement;
  }

  private setState(newState: ApplicationState): void {
    this.#appState = newState;
    logger.debug(`State: ${newState}`);
  }

  getState(): ApplicationState {
    return this.#appState;
  }
}

const controller = new AppController();
controller.init().catch((err: unknown) => {
  logger.error("App initialization failed:", err);
  const status = document.getElementById("status");
  if (status) {
    status.textContent =
      "Failed to initialize. Please reload.";
  }
});
