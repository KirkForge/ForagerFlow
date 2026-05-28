import { ModelKey, ApplicationState } from "@/core/types";
import { inferenceService } from "@/inference/service";
import { CameraService } from "@/services/camera";
import { processFileInput } from "@/services/image-input";
import { registerServiceWorker, updateOnlineStatus } from "@/services/connectivity";
import { generatePredictionReport } from "@/inference/results";
import { modelRegistry } from "@/data/model-registry";
import { ResultsRenderer } from "@/ui/results";
import { saveIdentification, getHistory, clearHistory } from "@/services/history";
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
  private statusEl: HTMLElement;
  private badgeEl: HTMLElement;
  private videoEl: HTMLVideoElement;
  private captureBtn: HTMLButtonElement;
  private cameraErrorEl: HTMLElement;
  #appState: ApplicationState = ApplicationState.Loading;

  constructor() {
    this.statusEl = this.require("#status");
    this.badgeEl = this.require("#badge");
    this.videoEl = this.require("#video") as unknown as HTMLVideoElement;
    this.captureBtn = this.require("#capture-btn") as unknown as HTMLButtonElement;
    this.cameraErrorEl = this.require("#camera-error");
    this.renderer = new ResultsRenderer(this.require("#app"));
  }

  async init(): Promise<void> {
    this.setState(ApplicationState.Loading);
    registerServiceWorker();
    initWebVitals();
    this.bindEvents();
    updateOnlineStatus(this.badgeEl);

    inferenceService.initialize();

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
      saveIdentification(report, modelKey).catch((_e: unknown) => { /* best-effort save */ });
      void this.renderHistory();
    });

    inferenceService.on("error", (error) => {
      this.statusEl.textContent = `Error: ${error.message}`;
      this.setState(ApplicationState.CameraError);
    });

    await this.startCamera();
    void this.renderHistory();
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
    const result = this.camera.capture();
    if (!result) return;
    inferenceService.infer(result.buffer, result.width, result.height);
  }

  private async handleFileSelect(
    e: Event,
  ): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const { buffer, width, height } = await processFileInput(file);
      inferenceService.infer(buffer, width, height);
      this.statusEl.textContent = "Processing...";
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
        .map((e) => {
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
            const { deleteEntry } = await import("@/services/history");
            await deleteEntry(id);
            void this.renderHistory();
          })();
        });
      });
    } catch {
      list.innerHTML = "<p>Unable to load history.</p>";
    }
  }

  private async handleClearHistory(): Promise<void> {
    await clearHistory();
    void this.renderHistory();
  }

  private bindEvents(): void {
    this.captureBtn.addEventListener("click", () => {
      this.handleCapture();
    });

    const fileInput = document.getElementById("file-input");
    fileInput?.addEventListener("change", (e) => {
      void this.handleFileSelect(e);
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
