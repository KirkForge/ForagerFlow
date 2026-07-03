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
  HistoryDetailPanel,
} from "@/ui";
import type { ComparisonItem } from "@/ui/comparison";
import type { LoadProgress } from "@/inference/service";
import {
  saveIdentification,
  getHistory,
  searchHistory,
  clearHistory,
  exportHistory,
  exportHistoryEncrypted,
  importHistory,
  isDataUrlThumbnail,
  isValidLocation,
  isEncryptedEnvelope,
} from "@/services/history";
import type { HistoryEntry, GeoLocation } from "@/services/history";
import { closeDB } from "@/services/history/db";
import { initWebVitals } from "@/services/web-vitals";
import type { AppError } from "@/core/errors";
import { logger } from "@/core/logger";
import { config } from "@/core/config";
import {
  getEdibilityClass,
  createEl,
  hide,
  requireElement,
  show,
} from "@/ui/utils";
import { t } from "@/i18n";

const LOCATION_ENABLED_KEY = "ff:location-enabled-v1";

export class AppController {
  private camera = new CameraService(config.captureSize);
  renderer: ResultsRenderer;
  detailPanel: SpeciesDetailPanel;
  comparisonPanel: PredictionComparisonPanel;
  historyDetailPanel: HistoryDetailPanel;
  safety!: SafetyUI;
  statusEl: HTMLElement;
  badgeEl: HTMLElement;
  videoEl: HTMLVideoElement;
  captureBtn: HTMLButtonElement;
  torchBtn: HTMLButtonElement | null = null;
  cameraWrap: HTMLElement;
  focusReticle: HTMLElement | null = null;
  recaptureBtn: HTMLButtonElement | null = null;
  progressEl: HTMLElement;
  progressTextEl: HTMLElement;
  progressPctEl: HTMLElement;
  progressBarEl: HTMLElement;
  cameraErrorEl: HTMLElement;
  fileFallbackBtn: HTMLButtonElement | null = null;
  fileInputEl: HTMLInputElement | null = null;
  locationToggle: HTMLInputElement | null = null;
  locationStatus: HTMLElement | null = null;
  historySearchEl: HTMLInputElement | null = null;
  historySearchClearEl: HTMLButtonElement | null = null;
  #historyRenderPending = false;
  #historySearchQuery = "";
  #pendingThumbnail: string | null = null;
  #pendingLocation: GeoLocation | undefined;
  #lastReport: PredictionReport | undefined;
  #focusReticleTimeout: number | undefined;

  constructor() {
    this.statusEl = requireElement("#status", document, "AppController");
    this.badgeEl = requireElement("#badge", document, "AppController");
    this.videoEl = requireElement<HTMLVideoElement>(
      "#video",
      document,
      "AppController",
    );
    this.captureBtn = requireElement<HTMLButtonElement>(
      "#capture-btn",
      document,
      "AppController",
    );
    this.torchBtn = document.querySelector<HTMLButtonElement>("#torch-btn");
    this.updateTorchButton(false);
    this.cameraWrap = requireElement("#camera-wrap", document, "AppController");
    this.focusReticle = document.querySelector<HTMLElement>("#focus-reticle");
    this.recaptureBtn =
      document.querySelector<HTMLButtonElement>("#recapture-btn");
    this.progressEl = requireElement(
      "#model-progress",
      document,
      "AppController",
    );
    this.progressTextEl = requireElement(
      "#model-progress-text",
      document,
      "AppController",
    );
    this.progressPctEl = requireElement(
      "#model-progress-pct",
      document,
      "AppController",
    );
    this.progressBarEl = requireElement(
      "#model-progress-bar",
      document,
      "AppController",
    );
    this.cameraErrorEl = requireElement(
      "#camera-error",
      document,
      "AppController",
    );
    this.fileFallbackBtn =
      document.querySelector<HTMLButtonElement>("#file-fallback-btn");
    this.fileInputEl = document.querySelector<HTMLInputElement>("#file-input");
    this.locationToggle =
      document.querySelector<HTMLInputElement>("#location-toggle");
    this.locationStatus =
      document.querySelector<HTMLElement>("#location-status");
    this.historySearchEl =
      document.querySelector<HTMLInputElement>("#history-search");
    this.historySearchClearEl = document.querySelector<HTMLButtonElement>(
      "#history-search-clear",
    );
    this.historySearchEl?.setAttribute(
      "placeholder",
      t("history.searchPlaceholder"),
    );
    this.historySearchEl?.setAttribute("aria-label", t("history.searchAria"));
    this.historySearchClearEl?.setAttribute(
      "aria-label",
      t("history.searchClearAria"),
    );
    this.renderer = new ResultsRenderer(
      requireElement("#app", document, "AppController"),
      {
        onPredictionClick: (label) => {
          this.openSpeciesDetail(label);
        },
        onComparisonShow: (labels) => {
          this.openComparison(labels);
        },
      },
    );
    this.detailPanel = new SpeciesDetailPanel();
    this.comparisonPanel = new PredictionComparisonPanel();
    this.historyDetailPanel = new HistoryDetailPanel();
  }

  #localizedErrorMessage(error: AppError): string {
    switch (error.code) {
      case "MODEL_LOAD_FAILED":
        return t("status.modelLoadError");
      case "LABEL_LOGIT_MISMATCH":
        return t("status.labelMismatchError");
      case "INFERENCE_FAILED":
      default:
        return t("status.inferenceError");
    }
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

    inferenceService.onProgress((progress) => {
      this.updateModelProgress(progress);
    });

    inferenceService.onResult(({ logits, modelKey }) => {
      try {
        const model = modelRegistry[modelKey];
        const report = generatePredictionReport(logits, model);
        this.#lastReport = report;
        this.renderer.render(report, model);
        this.setCaptureBusy(false);
        this.setRecaptureVisible(true);
        this.hideModelProgress();
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
        this.statusEl.textContent = t("status.displayError");
        this.setCaptureBusy(false);
        this.#pendingThumbnail = null;
      }
    });

    inferenceService.onError((error) => {
      logger.error("Inference error:", error);
      this.statusEl.textContent = this.#localizedErrorMessage(error);
      this.setCaptureBusy(false);
      this.setRecaptureVisible(false);
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
      hide(this.cameraErrorEl);
      this.updateTorchVisibility();
    } catch {
      this.statusEl.textContent = t("status.cameraError");
      show(this.cameraErrorEl);
      this.updateTorchVisibility();
    }
  }

  private updateTorchVisibility(): void {
    if (!this.torchBtn) return;
    this.torchBtn.hidden = !this.camera.torchSupported();
  }

  private updateTorchButton(on: boolean): void {
    if (!this.torchBtn) return;
    this.torchBtn.setAttribute(
      "aria-label",
      on ? t("camera.torchOn") : t("camera.torchOff"),
    );
    this.torchBtn.classList.toggle("torch-on", on);
  }

  private async handleTorchToggle(): Promise<void> {
    const next = !this.camera.isTorchOn();
    const ok = await this.camera.setTorch(next);
    if (ok) {
      this.updateTorchButton(next);
      if ("vibrate" in navigator) {
        navigator.vibrate(20);
      }
    }
  }

  private handleVideoPointerDown(e: PointerEvent): void {
    e.preventDefault();
    const point = CameraService.mapDomPointToNormalized(
      this.videoEl,
      e.clientX,
      e.clientY,
    );
    if (!point) return;
    void (async () => {
      const ok = await this.camera.focusAt(point.x, point.y);
      if (ok) {
        this.showFocusReticle(e.clientX, e.clientY);
        if ("vibrate" in navigator) {
          navigator.vibrate(15);
        }
      }
    })();
  }

  private showFocusReticle(clientX: number, clientY: number): void {
    if (!this.focusReticle) return;
    const rect = this.cameraWrap.getBoundingClientRect();
    this.focusReticle.style.left = `${String(clientX - rect.left)}px`;
    this.focusReticle.style.top = `${String(clientY - rect.top)}px`;
    this.focusReticle.classList.add("active");
    window.clearTimeout(this.#focusReticleTimeout);
    this.#focusReticleTimeout = window.setTimeout(() => {
      this.focusReticle?.classList.remove("active");
    }, 1200);
  }

  private handleCapture(): void {
    if (this.captureBtn.dataset["busy"] === "true") return;
    const result = this.camera.capture();
    if (!result) {
      this.statusEl.textContent = t("status.cameraNotReady");
      return;
    }
    this.setCaptureBusy(true);
    this.setRecaptureVisible(false);
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

  private setRecaptureVisible(visible: boolean): void {
    if (!this.recaptureBtn) return;
    this.recaptureBtn.hidden = !visible;
  }

  private updateModelProgress(progress: LoadProgress): void {
    this.progressEl.hidden = false;
    const phaseText =
      progress.phase === "download"
        ? t("model.progressDownload")
        : t("model.progressCompile");
    this.progressTextEl.textContent = t("model.progressLabel", {
      model: modelRegistry[progress.modelKey].name,
      phase: phaseText,
    });
    const pct = `${String(progress.percent)}%`;
    this.progressPctEl.textContent = pct;
    this.progressBarEl.style.width = pct;
  }

  private hideModelProgress(): void {
    this.progressEl.hidden = true;
    this.progressBarEl.style.width = "0%";
  }

  private handleRecapture(): void {
    this.renderer.clear();
    this.detailPanel.close();
    this.comparisonPanel.close();
    this.historyDetailPanel.close();
    this.#lastReport = undefined;
    this.statusEl.textContent = t("status.cameraActive");
    this.setRecaptureVisible(false);
    this.hideModelProgress();
    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
    this.cameraWrap.scrollIntoView({ behavior: "smooth", block: "start" });
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

  private handleSearchInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.#historySearchQuery = input.value;
    this.updateSearchClearVisibility();
    void this.renderHistory();
  }

  private handleSearchClear(): void {
    if (this.historySearchEl) {
      this.historySearchEl.value = "";
    }
    this.#historySearchQuery = "";
    this.updateSearchClearVisibility();
    void this.renderHistory();
  }

  private updateSearchClearVisibility(): void {
    if (!this.historySearchClearEl) return;
    this.historySearchClearEl.hidden =
      this.#historySearchQuery.trim().length === 0;
  }

  private handleModelSwitch(e: Event): void {
    const select = e.target as HTMLSelectElement;
    const key = select.value === "dima806" ? ModelKey.Dima806 : ModelKey.BVRA;
    this.renderer.clear();
    this.detailPanel.close();
    this.comparisonPanel.close();
    this.historyDetailPanel.close();
    this.#lastReport = undefined;
    this.setRecaptureVisible(false);
    this.hideModelProgress();
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
    const confidence = this.#lastReport?.confidence ?? {
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

  private async openHistoryDetail(id: string): Promise<void> {
    if (!id) return;
    try {
      const entries = await getHistory(20);
      const entry = entries.find((e) => e.id === id);
      if (entry) {
        this.historyDetailPanel.open(entry);
      }
    } catch (err) {
      logger.error("Failed to open history detail:", err);
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

    const date = new Date(last.timestamp).toLocaleString();
    const species = last.top1Species;
    const edibility = last.top1Edibility;
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
    show(slot);
  }

  private renderHistoryItem(entry: HistoryEntry): HTMLElement {
    const date = new Date(entry.timestamp).toLocaleDateString();
    const model = entry.modelKey;
    const species = entry.top1Species;
    const edibility = entry.top1Edibility;
    const prob = (entry.top1Probability * 100).toFixed(1);
    const id = entry.id;
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
      const query = this.#historySearchQuery.trim();
      const entries = query
        ? await searchHistory(query, { limit: 20 })
        : await getHistory(20);

      if (entries.length === 0) {
        list.innerHTML = "";
        list.appendChild(
          createEl(
            "p",
            "history-empty",
            query ? t("history.noSearchResults") : t("history.empty"),
          ),
        );
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
      const encryptToggle = document.querySelector<HTMLInputElement>(
        "#history-encrypt-export",
      );
      let json: string;
      if (encryptToggle?.checked) {
        const passphrase = await this.promptPassphrase();
        if (passphrase === null) return; // user cancelled
        if (!passphrase) {
          this.statusEl.textContent = t("status.passphraseRequired");
          return;
        }
        json = await exportHistoryEncrypted(passphrase);
      } else {
        json = await exportHistory();
      }
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
      let passphrase: string | undefined;
      if (isEncryptedEnvelope(text)) {
        const entered = await this.promptPassphrase();
        if (entered === null) return; // user cancelled
        passphrase = entered;
      }
      const count = await importHistory(text, passphrase);
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

  // ponytail: passphrase entry reuses the existing confirm-modal shape (dialog +
  // form submit + Esc-cancel) so no new UI machinery. Resolves the entered
  // string, or null when the user cancels.
  private promptPassphrase(): Promise<string | null> {
    const modal = document.getElementById(
      "passphrase-modal",
    ) as HTMLDialogElement | null;
    const input = document.getElementById(
      "passphrase-input",
    ) as HTMLInputElement | null;
    const form = document.getElementById(
      "passphrase-form",
    ) as HTMLFormElement | null;
    const cancel = document.getElementById(
      "passphrase-cancel",
    ) as HTMLButtonElement | null;
    if (!modal || !input || !form || !cancel) {
      return Promise.resolve(null);
    }
    input.value = "";
    modal.showModal();
    input.focus();
    return new Promise<string | null>((resolve) => {
      const cleanup = () => {
        form.removeEventListener("submit", onSubmit);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("cancel", onDialogCancel);
        modal.close();
      };
      const onSubmit = (e: SubmitEvent) => {
        e.preventDefault();
        cleanup();
        resolve(input.value);
      };
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      const onDialogCancel = (e: Event) => {
        e.preventDefault();
        onCancel();
      };
      form.addEventListener("submit", onSubmit, { once: true });
      cancel.addEventListener("click", onCancel, { once: true });
      modal.addEventListener("cancel", onDialogCancel, { once: true });
    });
  }

  private bindEvents(): void {
    this.captureBtn.addEventListener("click", () => {
      this.handleCapture();
    });

    this.recaptureBtn?.addEventListener("click", () => {
      this.handleRecapture();
    });

    this.torchBtn?.addEventListener("click", () => {
      void this.handleTorchToggle();
    });

    this.videoEl.addEventListener("pointerdown", (e) => {
      this.handleVideoPointerDown(e);
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

    this.historySearchEl?.addEventListener("input", (e) => {
      this.handleSearchInput(e);
    });
    this.historySearchEl?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.handleSearchClear();
      }
    });
    this.historySearchClearEl?.addEventListener("click", () => {
      this.handleSearchClear();
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
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>(".history-delete");
      if (btn) {
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
        return;
      }
      const entryEl = target.closest<HTMLElement>(".history-entry");
      if (entryEl) {
        void this.openHistoryDetail(entryEl.dataset["id"] ?? "");
      }
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
}
