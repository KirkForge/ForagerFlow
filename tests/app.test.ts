import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModelKey } from "@/core/types";
import type { CaptureResult } from "@/services/camera";
import type * as CameraModule from "@/services/camera";
import { AppController } from "@/app";
import { ResultsRenderer } from "@/ui";
import { flushPromises } from "./helpers/promises";
import { makeHistoryEntry } from "./helpers/fixtures";
import { setLocale } from "@/i18n";
import { getHistory, searchHistory } from "@/services/history";

interface MockInferenceService {
  onStatus: (handler: (text: string) => void) => void;
  onResult: (
    handler: (result: { logits: Float32Array; modelKey: ModelKey }) => void,
  ) => void;
  onError: (handler: (error: Error) => void) => void;
  onProgress: (
    handler: (progress: { modelKey: ModelKey; phase: string; percent: number }) => void,
  ) => void;
  emitStatus: (text: string) => void;
  emitResult: (result: { logits: Float32Array; modelKey: ModelKey }) => void;
  emitError: (error: Error) => void;
  emitProgress: (progress: {
    modelKey: ModelKey;
    phase: string;
    percent: number;
  }) => void;
  initialize: ReturnType<typeof vi.fn>;
  switchModel: ReturnType<typeof vi.fn>;
  infer: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  isReady: ReturnType<typeof vi.fn>;
}

const mockInferenceService = vi.hoisted<MockInferenceService>(() => {
  let statusHandler: ((text: string) => void) | null = null;
  let resultHandler:
    | ((result: { logits: Float32Array; modelKey: ModelKey }) => void)
    | null = null;
  let errorHandler: ((error: Error) => void) | null = null;
  let progressHandler:
    | ((progress: { modelKey: ModelKey; phase: string; percent: number }) => void)
    | null = null;
  return {
    onStatus: (handler) => {
      statusHandler = handler;
    },
    onResult: (handler) => {
      resultHandler = handler;
    },
    onError: (handler) => {
      errorHandler = handler;
    },
    onProgress: (handler) => {
      progressHandler = handler;
    },
    emitStatus: (text: string) => statusHandler?.(text),
    emitResult: (result: { logits: Float32Array; modelKey: ModelKey }) =>
      resultHandler?.(result),
    emitError: (error: Error) => errorHandler?.(error),
    emitProgress: (progress: {
      modelKey: ModelKey;
      phase: string;
      percent: number;
    }) => progressHandler?.(progress),
    initialize: vi.fn(),
    switchModel: vi.fn(),
    infer: vi.fn(),
    terminate: vi.fn(),
    isReady: vi.fn().mockReturnValue(false),
    getActiveModelKey: vi.fn().mockReturnValue("bvra"),
  };
});

const mockCamera = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  capture: vi.fn(),
  torchSupported: vi.fn().mockReturnValue(false),
  isTorchOn: vi.fn().mockReturnValue(false),
  setTorch: vi.fn().mockResolvedValue(false),
  focusAt: vi.fn().mockResolvedValue(false),
}));

const mockRenderer = vi.hoisted(() => ({
  render: vi.fn(),
  clear: vi.fn(),
}));

const mockSafety = vi.hoisted(() => ({
  init: vi.fn().mockResolvedValue(undefined),
  confirmClearHistory: vi.fn().mockResolvedValue(true),
}));

const mockDetailPanel = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
}));

const mockComparisonPanel = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
}));

const mockHistoryDetailPanel = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/inference/service", () => ({
  inferenceService: mockInferenceService,
}));

vi.mock("@/services/camera", async () => {
  const actual = await vi.importActual<typeof CameraModule>("@/services/camera");
  return {
    CameraService: Object.assign(
      vi.fn(function () {
        return mockCamera;
      }),
      {
        mapDomPointToNormalized: actual.CameraService.mapDomPointToNormalized,
      },
    ),
  };
});

vi.mock("@/services/image-input", () => ({
  processFileInput: vi.fn().mockResolvedValue({
    buffer: new ArrayBuffer(224 * 224 * 4),
    width: 224,
    height: 224,
    thumbnail: "data:image/jpeg;base64,THUMB",
  } as CaptureResult),
}));

vi.mock("@/services/history", () => ({
  saveIdentification: vi.fn().mockResolvedValue("id-1"),
  getHistory: vi.fn().mockResolvedValue([]),
  searchHistory: vi.fn().mockResolvedValue([]),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  exportHistory: vi.fn().mockResolvedValue('{"version":1,"entries":[]}'),
  importHistory: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/services/history/delete-entry", () => ({
  deleteEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/ui", () => ({
  ResultsRenderer: vi.fn(function () {
    return mockRenderer;
  }),
  SafetyUI: vi.fn(function () {
    return mockSafety;
  }),
  SpeciesDetailPanel: vi.fn(function () {
    return mockDetailPanel;
  }),
  PredictionComparisonPanel: vi.fn(function () {
    return mockComparisonPanel;
  }),
  HistoryDetailPanel: vi.fn(function () {
    return mockHistoryDetailPanel;
  }),
}));

function renderAppHTML(): void {
  document.body.innerHTML = `
    <div id="app">
      <div id="status"></div>
      <div id="badge"></div>
      <div id="camera-wrap">
        <video id="video"></video>
        <div id="focus-reticle" hidden></div>
        <button id="capture-btn">Capture</button>
        <button id="torch-btn" hidden>🔦</button>
      </div>
      <div id="camera-error"></div>
      <button id="file-fallback-btn">Upload</button>
      <input id="file-input" type="file" />
      <select id="model-select">
        <option value="bvra">BVRA</option>
        <option value="dima806">dima806</option>
      </select>
      <div id="predictions"></div>
      <button id="recapture-btn" type="button" hidden>Recapture</button>
      <div id="knowledge"></div>
      <div id="warning"></div>
      <div id="low-confidence"></div>
      <div id="last-result"></div>
      <div id="history-list"></div>
      <input id="history-search" type="search" />
      <button id="history-search-clear">×</button>
      <button id="history-export">Export</button>
      <button id="history-import">Import</button>
      <input id="history-import-input" type="file" accept="application/json" />
      <button id="history-clear">Clear</button>
      <button id="camera-retry">Retry</button>
      <input id="location-toggle" type="checkbox" />
      <span id="location-status"></span>
      <div id="results">
        <div id="model-progress" role="status" hidden>
          <div class="model-progress-label">
            <span id="model-progress-text"></span>
            <span id="model-progress-pct"></span>
          </div>
          <div class="model-progress-track">
            <div id="model-progress-bar" class="model-progress-bar"></div>
          </div>
        </div>
      </div>
    </div>
    <dialog id="history-detail-modal">
      <div id="history-detail-content">
        <div class="detail-header">
          <h2 id="history-detail-title"></h2>
          <button id="history-detail-close" type="button" value="close">×</button>
        </div>
        <div id="history-detail-body">
          <img id="history-detail-thumbnail" class="history-detail-thumbnail" alt="" hidden />
          <div id="history-detail-meta" class="detail-meta"></div>
          <p id="history-detail-notes" class="detail-notes"></p>
          <p id="history-detail-safety" class="detail-safety"></p>
          <a id="history-detail-verify" class="verify-link" href="#"></a>
        </div>
      </div>
    </dialog>
  `;
}

describe("AppController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocale("en");
    renderAppHTML();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes the app and switches to BVRA", async () => {
    const controller = new AppController();
    await controller.init();

    expect(mockCamera.start).toHaveBeenCalled();
    expect(mockInferenceService.initialize).toHaveBeenCalled();
    expect(mockInferenceService.switchModel).toHaveBeenCalledWith(
      ModelKey.BVRA,
    );
  });

  it("renders result on inference result", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];

    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    expect(mockRenderer.render).toHaveBeenCalled();
  });

  it("updates the model progress UI", async () => {
    const controller = new AppController();
    await controller.init();

    mockInferenceService.emitProgress({
      modelKey: ModelKey.BVRA,
      phase: "download",
      percent: 42,
    });

    const progressEl = document.querySelector("#model-progress") as HTMLElement;
    const progressText = document.querySelector("#model-progress-text") as HTMLElement;
    const progressPct = document.querySelector("#model-progress-pct") as HTMLElement;
    const progressBar = document.querySelector("#model-progress-bar") as HTMLElement;

    expect(progressEl.hidden).toBe(false);
    expect(progressText.textContent).toContain("Specialist");
    expect(progressPct.textContent).toBe("42%");
    expect(progressBar.style.width).toBe("42%");
  });

  it("shows camera error when camera fails to start", async () => {
    mockCamera.start.mockRejectedValueOnce(new Error("no camera"));
    const controller = new AppController();
    await controller.init();

    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("Camera error. Try file input.");
  });

  it("handles capture button click", async () => {
    const controller = new AppController();
    await controller.init();

    mockCamera.capture.mockReturnValue({
      buffer: new ArrayBuffer(224 * 224 * 4),
      width: 224,
      height: 224,
      thumbnail: "thumb",
    } as CaptureResult);

    const captureBtn = document.querySelector("#capture-btn") as HTMLElement;
    captureBtn.click();

    expect(mockInferenceService.infer).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      224,
      224,
    );
  });

  it("handles file selection", async () => {
    const { processFileInput } = await import("@/services/image-input");
    const controller = new AppController();
    await controller.init();

    const input = document.querySelector("#file-input") as HTMLInputElement;
    const file = new File([], "test.jpg", { type: "image/jpeg" });
    setFiles(input, file);
    input.dispatchEvent(new Event("change"));

    await flushPromises();
    expect(processFileInput).toHaveBeenCalledWith(file);
    expect(mockInferenceService.infer).toHaveBeenCalled();
  });

  it("updates online status on network change", async () => {
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });

    const controller = new AppController();
    await controller.init();

    window.dispatchEvent(new Event("offline"));
    const badge = document.querySelector("#badge") as HTMLElement;
    expect(badge.textContent).toBe("Offline");

    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
  });

  it("switches model on selector change", async () => {
    const controller = new AppController();
    await controller.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = "dima806";
    select.dispatchEvent(new Event("change"));

    expect(mockRenderer.clear).toHaveBeenCalled();
    expect(mockInferenceService.switchModel).toHaveBeenCalledWith(
      ModelKey.Dima806,
    );
  });

  it("clears history when clear button is clicked", async () => {
    const { clearHistory } = await import("@/services/history");
    const controller = new AppController();
    await controller.init();

    const clearBtn = document.querySelector("#history-clear") as HTMLElement;
    clearBtn.click();

    await flushPromises();
    expect(clearHistory).toHaveBeenCalled();
  });

  it("renders last result and history entries", async () => {
    const { getHistory } = await import("@/services/history");
    vi.mocked(getHistory).mockResolvedValue([makeHistoryEntry()]);

    const controller = new AppController();
    await controller.init();
    await flushPromises();

    const list = document.querySelector("#history-list") as HTMLElement;
    expect(list.children.length).toBeGreaterThan(0);

    const slot = document.querySelector("#last-result") as HTMLElement;
    expect(slot.style.display).toBe("block");
  });

  it("shows empty history message when no entries", async () => {
    const { getHistory } = await import("@/services/history");
    vi.mocked(getHistory).mockResolvedValue([]);

    const controller = new AppController();
    await controller.init();
    await flushPromises();

    const list = document.querySelector("#history-list") as HTMLElement;
    expect(list.textContent).toContain("No past identifications yet");
  });

  it("cancels clear history when dialog returns false", async () => {
    const { clearHistory } = await import("@/services/history");
    mockSafety.confirmClearHistory.mockResolvedValueOnce(false);

    const controller = new AppController();
    await controller.init();

    const clearBtn = document.querySelector("#history-clear") as HTMLElement;
    clearBtn.click();

    await flushPromises();
    expect(clearHistory).not.toHaveBeenCalled();
  });

  it("shows error when file processing fails", async () => {
    const { processFileInput } = await import("@/services/image-input");
    vi.mocked(processFileInput).mockRejectedValueOnce(new Error("bad image"));

    const controller = new AppController();
    await controller.init();

    const input = document.querySelector("#file-input") as HTMLInputElement;
    const file = new File([], "test.jpg", { type: "image/jpeg" });
    setFiles(input, file);
    input.dispatchEvent(new Event("change"));

    await flushPromises();
    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("Failed to process image.");
  });

  it("sets error state on inference error", async () => {
    const controller = new AppController();
    await controller.init();

    mockInferenceService.emitError(new Error("model failed"));
    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toContain("model failed");
  });

  it("skips capture when button is busy", async () => {
    const controller = new AppController();
    await controller.init();

    const captureBtn = document.querySelector(
      "#capture-btn",
    ) as HTMLButtonElement;
    captureBtn.dataset["busy"] = "true";
    captureBtn.click();

    expect(mockCamera.capture).not.toHaveBeenCalled();
  });

  it("shows message when capture returns no result", async () => {
    const controller = new AppController();
    await controller.init();

    mockCamera.capture.mockReturnValue(null);
    const captureBtn = document.querySelector("#capture-btn") as HTMLElement;
    captureBtn.click();

    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("Camera not ready. Wait a moment.");
  });

  it("retries camera when retry button is clicked", async () => {
    const controller = new AppController();
    await controller.init();

    const retryBtn = document.querySelector("#camera-retry") as HTMLElement;
    retryBtn.click();

    expect(mockCamera.start).toHaveBeenCalledTimes(2);
  });

  it("switches back to BVRA from dima806", async () => {
    const controller = new AppController();
    await controller.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = "bvra";
    select.dispatchEvent(new Event("change"));

    expect(mockInferenceService.switchModel).toHaveBeenCalledWith(
      ModelKey.BVRA,
    );
  });

  it("stops camera and terminates inference on pagehide", async () => {
    const controller = new AppController();
    await controller.init();

    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    );
    expect(mockCamera.stop).toHaveBeenCalled();
    expect(mockInferenceService.terminate).toHaveBeenCalled();
  });

  it("reinitializes on persisted pageshow", async () => {
    const controller = new AppController();
    await controller.init();

    const initCalls = mockInferenceService.initialize.mock.calls.length;
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    await flushPromises();

    expect(mockInferenceService.initialize.mock.calls.length).toBeGreaterThan(
      initCalls,
    );
    expect(mockInferenceService.switchModel).toHaveBeenCalledWith(
      ModelKey.BVRA,
    );
  });

  it("delegates history delete button clicks", async () => {
    const { getHistory } = await import("@/services/history");
    const { deleteEntry } = await import("@/services/history/delete-entry");
    vi.mocked(getHistory).mockResolvedValue([
      makeHistoryEntry({ id: "h-del" }),
    ]);

    const controller = new AppController();
    await controller.init();
    await flushPromises();

    const list = document.querySelector("#history-list") as HTMLElement;
    const delBtn = list.querySelector(".history-delete") as HTMLElement;
    delBtn.click();

    await flushPromises();
    expect(deleteEntry).toHaveBeenCalledWith("h-del");
  });

  it("opens history detail when an entry is clicked", async () => {
    const { getHistory } = await import("@/services/history");
    const entry = makeHistoryEntry({ id: "h-detail", top1Species: "Amanita muscaria" });
    vi.mocked(getHistory).mockResolvedValue([entry]);

    const controller = new AppController();
    await controller.init();
    await flushPromises();

    const list = document.querySelector("#history-list") as HTMLElement;
    const entryEl = list.querySelector(".history-entry") as HTMLElement;
    entryEl.click();

    await flushPromises();
    expect(mockHistoryDetailPanel.open).toHaveBeenCalledWith(entry);
  });

  it("does not open history detail when delete button is clicked", async () => {
    const { getHistory } = await import("@/services/history");
    const { deleteEntry } = await import("@/services/history/delete-entry");
    vi.mocked(getHistory).mockResolvedValue([
      makeHistoryEntry({ id: "h-no-detail" }),
    ]);

    const controller = new AppController();
    await controller.init();
    await flushPromises();

    const list = document.querySelector("#history-list") as HTMLElement;
    const delBtn = list.querySelector(".history-delete") as HTMLElement;
    delBtn.click();

    await flushPromises();
    expect(deleteEntry).toHaveBeenCalled();
    expect(mockHistoryDetailPanel.open).not.toHaveBeenCalled();
  });

  it("exports history when export button is clicked", async () => {
    const { exportHistory } = await import("@/services/history");
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL");

    const controller = new AppController();
    await controller.init();

    const exportBtn = document.querySelector("#history-export") as HTMLElement;
    exportBtn.click();

    await flushPromises();
    expect(exportHistory).toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock");
    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("History exported.");

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it("shows error when export fails", async () => {
    const { exportHistory } = await import("@/services/history");
    vi.mocked(exportHistory).mockRejectedValueOnce(new Error("export failed"));

    const controller = new AppController();
    await controller.init();

    const exportBtn = document.querySelector("#history-export") as HTMLElement;
    exportBtn.click();

    await flushPromises();
    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("Failed to export history.");
  });

  it("opens the import file picker when import button is clicked", async () => {
    const controller = new AppController();
    await controller.init();

    const importBtn = document.querySelector("#history-import") as HTMLElement;
    const input = document.querySelector(
      "#history-import-input",
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    importBtn.click();
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it("imports history when a file is selected", async () => {
    const { importHistory } = await import("@/services/history");
    const fileText = '{"version":1,"entries":[]}';
    const file = new File([fileText], "backup.json", {
      type: "application/json",
    });

    const controller = new AppController();
    await controller.init();

    const input = document.querySelector(
      "#history-import-input",
    ) as HTMLInputElement;
    setFiles(input, file);
    input.dispatchEvent(new Event("change"));

    await flushPromises();
    expect(importHistory).toHaveBeenCalledWith(fileText);
    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("Imported 0 history entries.");
  });

  it("shows error when import fails", async () => {
    const { importHistory } = await import("@/services/history");
    vi.mocked(importHistory).mockRejectedValueOnce(new Error("import failed"));
    const file = new File(["not-json"], "bad.json", {
      type: "application/json",
    });

    const controller = new AppController();
    await controller.init();

    const input = document.querySelector(
      "#history-import-input",
    ) as HTMLInputElement;
    setFiles(input, file);
    input.dispatchEvent(new Event("change"));

    await flushPromises();
    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("Failed to import history.");
  });

  it("opens species detail when a prediction is clicked", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];

    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    const options = vi.mocked(ResultsRenderer).mock.calls[0]?.[1];
    expect(options).toBeDefined();
    expect(options?.onPredictionClick).toBeTypeOf("function");
    options?.onPredictionClick?.(model.labels[0] ?? "Agaricus bisporus");

    expect(mockDetailPanel.open).toHaveBeenCalled();
  });

  it("opens comparison panel when two predictions are selected", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];

    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    const options = vi.mocked(ResultsRenderer).mock.calls[0]?.[1];
    expect(options).toBeDefined();
    options?.onComparisonShow?.([
      model.labels[0] ?? "Agaricus bisporus",
      model.labels[1] ?? "Amanita phalloides",
    ]);

    expect(mockComparisonPanel.open).toHaveBeenCalled();
  });

  it("closes detail and comparison panels on model switch", async () => {
    const controller = new AppController();
    await controller.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = "dima806";
    select.dispatchEvent(new Event("change"));

    expect(mockDetailPanel.close).toHaveBeenCalled();
    expect(mockComparisonPanel.close).toHaveBeenCalled();
  });

  it("shows re-capture button after inference result", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];

    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    const recaptureBtn = document.querySelector(
      "#recapture-btn",
    ) as HTMLButtonElement;
    expect(recaptureBtn.hidden).toBe(false);
  });

  it("hides re-capture button when a new capture starts", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];
    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    mockCamera.capture.mockReturnValue({
      buffer: new ArrayBuffer(224 * 224 * 4),
      width: 224,
      height: 224,
      thumbnail: "thumb",
    } as CaptureResult);

    const captureBtn = document.querySelector("#capture-btn") as HTMLElement;
    captureBtn.click();

    const recaptureBtn = document.querySelector(
      "#recapture-btn",
    ) as HTMLButtonElement;
    expect(recaptureBtn.hidden).toBe(true);
  });

  it("hides re-capture button on inference error", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];
    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    mockInferenceService.emitError(new Error("model failed"));

    const recaptureBtn = document.querySelector(
      "#recapture-btn",
    ) as HTMLButtonElement;
    expect(recaptureBtn.hidden).toBe(true);
  });

  it("hides re-capture button on model switch", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];
    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = "dima806";
    select.dispatchEvent(new Event("change"));

    const recaptureBtn = document.querySelector(
      "#recapture-btn",
    ) as HTMLButtonElement;
    expect(recaptureBtn.hidden).toBe(true);
  });

  it("handles re-capture button click", async () => {
    const controller = new AppController();
    await controller.init();

    const { modelRegistry } = await import("@/data/model-registry");
    const model = modelRegistry[ModelKey.BVRA];
    mockInferenceService.emitResult({
      logits: new Float32Array(model.labels.length),
      modelKey: ModelKey.BVRA,
    });

    const cameraWrap = document.querySelector("#camera-wrap") as HTMLElement;
    const scrollMock = vi.fn();
    cameraWrap.scrollIntoView = scrollMock;

    const recaptureBtn = document.querySelector(
      "#recapture-btn",
    ) as HTMLButtonElement;
    recaptureBtn.click();

    expect(mockRenderer.clear).toHaveBeenCalled();
    expect(mockDetailPanel.close).toHaveBeenCalled();
    expect(mockComparisonPanel.close).toHaveBeenCalled();
    const status = document.querySelector("#status") as HTMLElement;
    expect(status.textContent).toBe("Camera active. Tap shutter to identify.");
    expect(recaptureBtn.hidden).toBe(true);
    expect(scrollMock).toHaveBeenCalled();
  });

  it("filters history when search input changes", async () => {
    const controller = new AppController();
    await controller.init();

    const entry = makeHistoryEntry({ top1Species: "Amanita muscaria" });
    vi.mocked(searchHistory).mockResolvedValueOnce([entry]);

    const input = document.querySelector<HTMLInputElement>("#history-search")!;
    input.value = "amanita";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await flushPromises();

    expect(searchHistory).toHaveBeenCalledWith("amanita", { limit: 20 });
    const list = document.getElementById("history-list")!;
    expect(list.textContent).toContain("Amanita muscaria");
  });

  it("clears history search and reloads all entries", async () => {
    const controller = new AppController();
    await controller.init();

    const input = document.querySelector<HTMLInputElement>("#history-search")!;
    input.value = "amanita";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();

    vi.mocked(searchHistory).mockClear();
    vi.mocked(getHistory).mockClear();

    const clearBtn = document.querySelector<HTMLButtonElement>(
      "#history-search-clear",
    )!;
    clearBtn.click();
    await flushPromises();

    expect(input.value).toBe("");
    expect(searchHistory).not.toHaveBeenCalled();
    expect(getHistory).toHaveBeenCalledWith(20);
  });

  it("shows torch button when supported and toggles it", async () => {
    vi.mocked(mockCamera.torchSupported).mockReturnValue(true);
    vi.mocked(mockCamera.setTorch).mockResolvedValue(true);

    const controller = new AppController();
    await controller.init();

    const torchBtn = document.querySelector<HTMLButtonElement>("#torch-btn")!;
    expect(torchBtn.hidden).toBe(false);
    expect(torchBtn.getAttribute("aria-label")).toBe("Turn flashlight on");

    torchBtn.click();
    await flushPromises();

    expect(mockCamera.setTorch).toHaveBeenCalledWith(true);
    expect(torchBtn.classList.contains("torch-on")).toBe(true);
    expect(torchBtn.getAttribute("aria-label")).toBe("Turn flashlight off");
  });

  it("hides torch button when not supported", async () => {
    vi.mocked(mockCamera.torchSupported).mockReturnValue(false);

    const controller = new AppController();
    await controller.init();

    const torchBtn = document.querySelector<HTMLButtonElement>("#torch-btn")!;
    expect(torchBtn.hidden).toBe(true);
  });

  it("focuses on video tap when supported", async () => {
    vi.mocked(mockCamera.focusAt).mockResolvedValue(true);

    const controller = new AppController();
    await controller.init();

    const video = document.querySelector<HTMLVideoElement>("#video")!;
    Object.defineProperty(video, "videoWidth", { value: 640 });
    Object.defineProperty(video, "videoHeight", { value: 480 });
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 320,
      height: 320,
    } as DOMRect);

    video.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 160, clientY: 160, bubbles: true }),
    );
    await flushPromises();

    expect(mockCamera.focusAt).toHaveBeenCalledWith(0.5, 0.5);
    const reticle = document.querySelector<HTMLElement>("#focus-reticle")!;
    expect(reticle.classList.contains("active")).toBe(true);
  });

  it("does not show reticle when focus is unsupported", async () => {
    vi.mocked(mockCamera.focusAt).mockResolvedValue(false);

    const controller = new AppController();
    await controller.init();

    const video = document.querySelector<HTMLVideoElement>("#video")!;
    Object.defineProperty(video, "videoWidth", { value: 640 });
    Object.defineProperty(video, "videoHeight", { value: 480 });
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 320,
      height: 320,
    } as DOMRect);

    video.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 80, clientY: 80, bubbles: true }),
    );
    await flushPromises();

    expect(mockCamera.focusAt).toHaveBeenCalled();
    const reticle = document.querySelector<HTMLElement>("#focus-reticle")!;
    expect(reticle.classList.contains("active")).toBe(false);
  });
});

function setFiles(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", {
    value: {
      0: file,
      length: 1,
      item: (i: number) => (i === 0 ? file : null),
    } as unknown as FileList,
    configurable: true,
  });
}
