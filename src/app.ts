import { Edibility, ModelKey } from "@/core/types";
import type { PredictionReport } from "@/inference/results";
import { inferenceService } from "@/inference/service";
import { CameraService } from "@/services/camera";
import { processFileInput } from "@/services/image-input";
import {
  registerServiceWorker,
  updateOnlineStatus,
} from "@/services/connectivity";
import { generatePredictionReport } from "@/inference/results";
import { modelRegistry } from "@/data/model-registry";
import {
  ResultsRenderer,
  SafetyUI,
  SpeciesDetailPanel,
  PredictionComparisonPanel,
} from "@/ui";
import type { ComparisonItem } from "@/ui/comparison";
import {
  saveIdentification,
  getHistory,
  clearHistory,
  exportHistory,
  importHistory,
  isDataUrlThumbnail,
  isValidLocation,
} from "@/services/history";
import type { HistoryEntry, GeoLocation } from "@/services/history";
import { closeDB } from "@/services/history/db";
import { initWebVitals } from "@/services/web-vitals";
import { logger } from "@/core/logger";
import { sanitizeText } from "@/core/sanitize";
import { config } from "@/core/config";
import { getEdibilityClass, createEl } from "@/ui/utils";
import { t } from "@/i18n";

const LOCATION_ENABLED_KEY = "ff:location-enabled-v1";

export class AppController {
  private camera = new CameraService(config.captureSize);
  renderer: ResultsRenderer;
  detailPanel: SpeciesDetailPanel;
  comparisonPanel: PredictionComparisonPanel;
  safety!: SafetyUI;
  statusEl: HTMLElement;
  badgeEl: HTMLElement;
  videoEl: HTMLVideoElement;
  captureBtn: HTMLButtonElement;
  cameraErrorEl: HTMLElement;
  fileFallbackBtn: HTMLButtonElement | null = null;
  fileInputEl: HTMLInputElement | null = null;
  locationToggle: HTMLInputElement | null = null;
  locationStatus: HTMLElement | null = null;
  #historyRenderPending = false;
  #pendingThumbnail: string | null = null;
  #pendingLocation: GeoLocation | undefined;
  #lastReport: PredictionReport | undefined;

  constructor() {
    this.statusEl = this.require("#status");
    this.badgeEl = this.require("#badge");
    this.videoEl = this.require("#video") as unknown as HTMLVideoElement;
    this.captureBtn = this.require(
      "#capture-btn",
    ) as unknown as HTMLButtonElement;
    this.cameraErrorEl = this.require("#camera-error");
    this.fileFallbackBtn =
      document.querySelector<HTMLButtonElement>("#file-fallback-btn");
    this.fileInputEl = document.querySelector<HTMLInputElement>("#file-input");
    this.locationToggle =
      document.querySelector<HTMLInputElement>("#location-toggle");
    this.locationStatus =
      document.querySelector<HTMLElement>("#location-status");
    this.renderer = new ResultsRenderer(this.require("#app"), {
      onPredictionClick: (label) => {
        this.openSpeciesDetail(label);
      },
      onComparisonShow: (labels) => {
        this.openComparison(labels);
      },
    });
    this.detailPanel = new SpeciesDetailPanel();
    this.comparisonPanel = new PredictionComparisonPanel();
  }

  async init(): Promise<void> {
    registerServiceWorker();
    initWebVitals();
    this.bindEvents();
    updateOnlineStatus(this.badgeEl);

    inferenceService.initialize();

    this.safety = new SafetyUI({
      inferenceService,
      onAcknowledged: () => {
        logger.debug("Safety acknowledgement recorded");
      },
    });

    inferenceService.onStatus((text) => {
      this.statusEl.textContent = text;
    });

    inferenceService.onResult(({ logits, modelKey }) => {
      try {
        const model = modelRegistry[modelKey];
        const report = generatePredictionReport(logits, model);
        this.#lastReport = report;
        this.renderer.render(report, model);
        this.setCaptureBusy(false);
        void saveIdentification(
          report,
          modelKey,
          this.#pendingThumbnail ?? undefined,
          this.#pendingLocation,
        )
          .catch((_e: unknown) => {
            /* best-effort save */
          })
          .finally(() => {
            this.#pendingThumbnail = null;
            this.#pendingLocation = undefined;
          });
        void this.renderHistory();
      } catch (err) {
        logger.error("Failed to render result:", err);
        this.statusEl.textContent = "Error displaying result.";
        this.setCaptureBusy(false);
        this.#pendingThumbnail = null;
      }
    });

    inferenceService.onError((error) => {
      this.statusEl.textContent = `Error: ${error.message}`;
      this.setCaptureBusy(false);
      this.#pendingThumbnail = null;
    });

    await this.safety.init();
    this.initLocationToggle();

    await this.startCamera();
    void this.renderHistory();
    void this.renderLastResult();
    inferenceService.switchModel(ModelKey.BVRA);
  }

  private async startCamera(): Promise<void> {
    try {
      await this.camera.start(this.videoEl);
      this.statusEl.textContent = t("status.cameraActive");
      this.cameraErrorEl.style.display = "none";
    } catch {
      this.statusEl.textContent = t("status.cameraError");
      this.cameraErrorEl.style.display = "flex";
    }
  }

  private handleCapture(): void {
    if (this.captureBtn.dataset["busy"] === "true") return;
    const result = this.camera.capture();
    if (!result) {
      this.statusEl.textContent = t("status.cameraNotReady");
      return;
    }
    this.setCaptureBusy(true);
    this.statusEl.textContent = t("status.identifying");
    this.#pendingThumbnail = result.thumbnail;
    this.startLocationCapture();
    inferenceService.infer(result.buffer, result.width, result.height);
  }

  private setCaptureBusy(busy: boolean): void {
    this.captureBtn.dataset["busy"] = busy ? "true" : "false";
    this.captureBtn.disabled = busy;
    this.captureBtn.setAttribute("aria-busy", busy ? "true" : "false");
  }

  private async handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const result = await processFileInput(file);
      this.setCaptureBusy(true);
      this.statusEl.textContent = t("status.identifying");
      this.#pendingThumbnail = result.thumbnail;
      this.startLocationCapture();
      inferenceService.infer(result.buffer, result.width, result.height);
    } catch (err) {
      logger.error("File processing failed:", err);
      this.statusEl.textContent = t("status.processImageError");
      this.setCaptureBusy(false);
    }
  }

  private handleRetryCamera(): void {
    void this.startCamera();
  }

  private handleModelSwitch(e: Event): void {
    const select = e.target as HTMLSelectElement;
    const key = select.value === "dima806" ? ModelKey.Dima806 : ModelKey.BVRA;
    this.renderer.clear();
    this.detailPanel.close();
    this.comparisonPanel.close();
    this.#lastReport = undefined;
    inferenceService.switchModel(key);
  }

  private openSpeciesDetail(label: string): void {
    const modelKey = inferenceService.getActiveModelKey();
    const model = modelRegistry[modelKey];
    const prediction = this.#lastReport?.predictions.find(
      (p) => p.label === label,
    ) ?? {
      label,
      probability: 0,
      index: -1,
    };
    const confidence =
      this.#lastReport?.confidence ?? {
        score: prediction.probability,
        reliability: "low",
        gap: 0,
      };
    const knowledge = model.knowledge[label] ?? {
      edibility: Edibility.Unknown,
      notes: t("knowledge.noData"),
    };
    this.detailPanel.open(label, prediction, knowledge, confidence);
  }

  private openComparison(labels: string[]): void {
    if (labels.length < 2 || !this.#lastReport) return;

    const modelKey = inferenceService.getActiveModelKey();
    const model = modelRegistry[modelKey];
    const items: ComparisonItem[] = [];

    for (const label of labels) {
      const prediction = this.#lastReport.predictions.find(
        (p) => p.label === label,
      );
      if (!prediction) continue;
      const knowledge = model.knowledge[label] ?? {
        edibility: Edibility.Unknown,
        notes: t("knowledge.noData"),
      };
      items.push({
        prediction,
        knowledge,
        confidence: this.#lastReport.confidence,
      });
    }

    if (items.length >= 2) {
      this.comparisonPanel.open(items);
    }
  }

  handleOfflineChange(): void {
    updateOnlineStatus(this.badgeEl);
  }

  private initLocationToggle(): void {
    if (!this.locationToggle || !this.locationStatus) return;

    const enabled = localStorage.getItem(LOCATION_ENABLED_KEY) === "true";
    const toggle = this.locationToggle;
    toggle.checked = enabled;
    this.updateLocationStatus(enabled);

    toggle.addEventListener("change", () => {
      const now = toggle.checked;
      localStorage.setItem(LOCATION_ENABLED_KEY, String(now));
      this.updateLocationStatus(now);
      if (now) {
        void this.captureLocation();
      } else {
        this.#pendingLocation = undefined;
      }
    });
  }

  private updateLocationStatus(enabled: boolean): void {
    this.setLocationStatus(
      enabled ? t("location.enabled") : t("location.disabled"),
    );
  }

  private setLocationStatus(text: string): void {
    if (this.locationStatus) {
      this.locationStatus.textContent = text;
    }
  }

  private async captureLocation(): Promise<void> {
    if (!this.locationToggle?.checked) return;
    if (!("geolocation" in navigator)) {
      this.setLocationStatus(t("location.unavailable"));
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 60000,
          });
        },
      );
      this.#pendingLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      this.setLocationStatus(
        t("location.active", {
          lat: this.#pendingLocation.lat.toFixed(4),
          lng: this.#pendingLocation.lng.toFixed(4),
        }),
      );
    } catch (err) {
      const error = err as GeolocationPositionError | Error;
      const code = "code" in error ? error.code : undefined;
      let key: string;
      switch (code) {
        case 1:
          key = "location.denied";
          break;
        case 2:
          key = "location.unavailable";
          break;
        case 3:
          key = "location.timeout";
          break;
        case undefined:
        default:
          key = "location.unavailable";
          break;
      }
      this.setLocationStatus(t(key));
    }
  }

  private startLocationCapture(): void {
    if (!this.locationToggle?.checked) return;
    this.#pendingLocation = undefined;
    void this.captureLocation();
  }

  private async renderLastResult(): Promise<void> {
    const entries = await getHistory(1);
    const last = entries[0];
    if (!last) return;

    const slot = document.getElementById("last-result");
    if (!slot) return;

    const date = sanitizeText(new Date(last.timestamp).toLocaleString());
    const species = sanitizeText(last.top1Species);
    const edibility = sanitizeText(last.top1Edibility);
    const prob = (last.top1Probability * 100).toFixed(1);
    const edClass = getEdibilityClass(last.top1Edibility);

    slot.innerHTML = "";
    const inner = createEl("div", "last-result-inner");
    inner.appendChild(
      createEl("div", "last-result-label", t("history.lastIdentification")),
    );
    inner.appendChild(createEl("div", "last-result-species", species));

    const meta = createEl("div", "last-result-meta");
    const edSpan = createEl("span", `history-edibility ${edClass}`, edibility);
    meta.appendChild(edSpan);
    meta.appendChild(createEl("span", "last-result-prob", `${prob}%`));
    meta.appendChild(createEl("span", "last-result-date", date));
    inner.appendChild(meta);

    slot.appendChild(inner);
    slot.style.display = "block";
  }

  private renderHistoryItem(entry: HistoryEntry): HTMLElement {
    const date = sanitizeText(new Date(entry.timestamp).toLocaleDateString());
    const model = sanitizeText(entry.modelKey);
    const species = sanitizeText(entry.top1Species);
    const edibility = sanitizeText(entry.top1Edibility);
    const prob = (entry.top1Probability * 100).toFixed(1);
    const id = sanitizeText(entry.id);
    const edClass = getEdibilityClass(entry.top1Edibility);

    const entryEl = createEl("div", "history-entry");
    entryEl.dataset["id"] = id;

    if (entry.thumbnail && isDataUrlThumbnail(entry.thumbnail)) {
      const thumb = document.createElement("img");
      thumb.src = entry.thumbnail;
      thumb.alt = t("history.thumbnailAlt", { species });
      thumb.className = "history-thumbnail";
      thumb.loading = "lazy";
      thumb.decoding = "async";
      entryEl.appendChild(thumb);
    } else if (entry.thumbnail) {
      logger.warn("Ignoring non-data URL thumbnail in history entry", entry.id);
    }

    const meta = createEl("div", "history-meta");
    meta.appendChild(createEl("span", "history-date", date));
    meta.appendChild(createEl("span", "history-model", model));
    meta.appendChild(
      createEl("span", `history-edibility ${edClass}`, edibility),
    );
    entryEl.appendChild(meta);
    entryEl.appendChild(createEl("div", "history-name", species));
    entryEl.appendChild(
      createEl("div", "history-prob", t("history.confidence", { prob })),
    );

    if (entry.location && isValidLocation(entry.location)) {
      const { lat, lng } = entry.location;
      const link = document.createElement("a");
      link.href = `geo:${String(lat)},${String(lng)}?q=${String(lat)},${String(lng)}`;
      link.className = "history-location";
      link.textContent = t("history.location", {
        lat: lat.toFixed(4),
        lng: lng.toFixed(4),
      });
      link.target = "_blank";
      link.rel = "noopener";
      entryEl.appendChild(link);
    }

    const delBtn = createEl(
      "button",
      "history-delete",
      "×",
    ) as HTMLButtonElement;
    delBtn.dataset["id"] = id;
    delBtn.setAttribute("aria-label", t("history.deleteEntryAria"));
    entryEl.appendChild(delBtn);

    return entryEl;
  }

  private async renderHistory(): Promise<void> {
    if (this.#historyRenderPending) return;
    this.#historyRenderPending = true;

    const list = document.getElementById("history-list");
    if (!list) {
      this.#historyRenderPending = false;
      return;
    }

    try {
      const entries = await getHistory(20);

      if (entries.length === 0) {
        list.innerHTML = "";
        list.appendChild(createEl("p", "history-empty", t("history.empty")));
        return;
      }

      const existing = new Map<string, HTMLElement>();
      for (const child of Array.from(list.children)) {
        const id = (child as HTMLElement).dataset["id"];
        if (id) existing.set(id, child as HTMLElement);
      }

      const fragment = document.createDocumentFragment();
      for (const entry of entries) {
        const id = entry.id;
        const el = existing.get(id) ?? this.renderHistoryItem(entry);
        existing.delete(id);
        fragment.appendChild(el);
      }

      for (const [, el] of existing) {
        el.remove();
      }

      list.innerHTML = "";
      list.appendChild(fragment);
    } catch {
      list.innerHTML = "";
      list.appendChild(createEl("p", undefined, t("history.loadError")));
    } finally {
      this.#historyRenderPending = false;
    }
  }

  private async handleClearHistory(): Promise<void> {
    try {
      const confirmed = await this.safety.confirmClearHistory();
      if (!confirmed) return;
      await clearHistory();
      void this.renderHistory();
      void this.renderLastResult();
    } catch (err) {
      logger.error("Failed to clear history:", err);
      this.statusEl.textContent = t("status.clearHistoryError");
    }
  }

  private async handleExportHistory(): Promise<void> {
    try {
      const json = await exportHistory();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foragerflow-history-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.statusEl.textContent = t("status.historyExported");
    } catch (err) {
      logger.error("Failed to export history:", err);
      this.statusEl.textContent = t("status.exportHistoryError");
    }
  }

  private async handleImportHistory(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const count = await importHistory(text);
      void this.renderHistory();
      void this.renderLastResult();
      this.statusEl.textContent = t("status.historyImported", {
        count: String(count),
      });
    } catch (err) {
      logger.error("Failed to import history:", err);
      this.statusEl.textContent = t("status.importHistoryError");
    } finally {
      input.value = "";
    }
  }

  private bindEvents(): void {
    this.captureBtn.addEventListener("click", () => {
      this.handleCapture();
    });

    this.fileInputEl?.addEventListener("change", (e) => {
      void this.handleFileSelect(e);
    });

    this.fileFallbackBtn?.addEventListener("click", () => {
      this.fileInputEl?.click();
    });

    const clearBtn = document.getElementById("history-clear");
    clearBtn?.addEventListener("click", () => {
      void this.handleClearHistory();
    });

    const exportBtn = document.getElementById("history-export");
    exportBtn?.addEventListener("click", () => {
      void this.handleExportHistory();
    });

    const importBtn = document.getElementById("history-import");
    const importInput = document.querySelector<HTMLInputElement>(
      "#history-import-input",
    );
    importBtn?.addEventListener("click", () => {
      importInput?.click();
    });
    importInput?.addEventListener("change", (e) => {
      void this.handleImportHistory(e);
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

    const historyList = document.getElementById("history-list");
    historyList?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(
        ".history-delete",
      );
      if (!btn) return;
      const id = btn.dataset["id"];
      if (!id) return;
      void (async () => {
        const { deleteEntry } = await import(
          /* @vite-ignore */ "@/services/history/delete-entry"
        );
        await deleteEntry(id);
        void this.renderHistory();
        void this.renderLastResult();
      })();
    });

    window.addEventListener("pagehide", (e) => {
      if (e.persisted) return;
      void closeDB();
      this.camera.stop();
      inferenceService.terminate();
    });

    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      inferenceService.initialize();
      void this.startCamera();
      inferenceService.switchModel(ModelKey.BVRA);
    });
  }

  private require(selector: string): HTMLElement {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Required element not found: ${selector}`);
    return el as HTMLElement;
  }
}
