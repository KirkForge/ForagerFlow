import { ModelKey } from "@/core/types";
import { inferenceService } from "@/inference/service";
import { CameraService } from "@/services/camera";
import { processFileInput } from "@/services/image-input";
import { registerServiceWorker, updateOnlineStatus } from "@/services/connectivity";
import { generatePredictionReport } from "@/inference/results";
import { modelRegistry } from "@/data/model-registry";
import { ResultsRenderer } from "@/ui/results";
import { logger } from "@/core/logger";

class AppController {
  private camera = new CameraService(224);
  private renderer: ResultsRenderer;
  private statusEl: HTMLElement;
  private badgeEl: HTMLElement;
  private videoEl: HTMLVideoElement;
  private captureBtn: HTMLButtonElement;
  private cameraErrorEl: HTMLElement;

  constructor() {
    this.statusEl = this.require("#status");
    this.badgeEl = this.require("#badge");
    this.videoEl = this.require("#video") as unknown as HTMLVideoElement;
    this.captureBtn = this.require("#capture-btn") as unknown as HTMLButtonElement;
    this.cameraErrorEl = this.require("#camera-error");
    this.renderer = new ResultsRenderer(this.require("#app"));
  }

  async init(): Promise<void> {
    registerServiceWorker();
    this.bindEvents();
    updateOnlineStatus(this.badgeEl);

    inferenceService.initialize();

    inferenceService.on("status", (text: string) => {
      this.statusEl.textContent = text;
    });

    inferenceService.on("result", (logits, modelKey) => {
      const model = modelRegistry[modelKey];
      const report = generatePredictionReport(logits, model);
      this.renderer.render(report, model);
    });

    inferenceService.on("error", (error) => {
      this.statusEl.textContent = `Error: ${error.message}`;
    });

    await this.startCamera();
    inferenceService.switchModel(ModelKey.BVRA);
  }

  private async startCamera(): Promise<void> {
    try {
      await this.camera.start(this.videoEl);
      this.statusEl.textContent = "Camera active. Tap shutter to identify.";
      this.cameraErrorEl.style.display = "none";
    } catch {
      this.statusEl.textContent = "Camera error. Try file input.";
      this.cameraErrorEl.style.display = "flex";
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

  private bindEvents(): void {
    this.captureBtn.addEventListener("click", () => {
      this.handleCapture();
    });

    const fileInput = document.getElementById("file-input");
    fileInput?.addEventListener("change", (e) => {
      void this.handleFileSelect(e);
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
