import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SafetyUI } from "@/ui/safety";
import { ModelKey } from "@/core/types";
import type { InferenceService } from "@/inference/service";

class MockInferenceService {
  resumeStorageConfirm = vi.fn();
  private storageHandler: ((payload: {
    modelKey: ModelKey;
    freeBytes: number;
    token: string;
  }) => void) | null = null;

  onStorageConfirm(
    handler: (payload: {
      modelKey: ModelKey;
      freeBytes: number;
      token: string;
    }) => void,
  ): void {
    this.storageHandler = handler;
  }

  emitStorageConfirm(payload: {
    modelKey: ModelKey;
    freeBytes: number;
    token: string;
  }): void {
    this.storageHandler?.(payload);
  }
}

function renderSafetyHTML(): void {
  document.body.innerHTML = `
    <select id="model-select">
      <option value="${ModelKey.BVRA}">Specialist</option>
      <option value="${ModelKey.Dima806}" data-capability-gated="true">General</option>
    </select>

    <dialog id="safety-modal">
      <form method="dialog" id="safety-form">
        <input type="checkbox" id="safety-modal-ack" />
        <button id="safety-modal-continue" type="submit" disabled>Continue</button>
      </form>
    </dialog>

    <dialog id="model-confirm-modal">
      <button id="model-confirm-accept" value="accept">Download</button>
      <button id="model-confirm-cancel" value="cancel">Cancel</button>
    </dialog>

    <dialog id="storage-confirm-modal">
      <p id="storage-confirm-body"></p>
      <button id="storage-confirm-accept">Continue</button>
      <button id="storage-confirm-cancel">Cancel</button>
    </dialog>

    <dialog id="clear-confirm-modal">
      <button id="clear-confirm-accept">Clear</button>
      <button id="clear-confirm-cancel">Cancel</button>
    </dialog>
  `;

  for (const dialog of document.querySelectorAll("dialog")) {
    (dialog as HTMLDialogElement).showModal = vi.fn();
    (dialog as HTMLDialogElement).close = vi.fn();
  }
}

describe("SafetyUI", () => {
  let inferenceService: MockInferenceService;
  let acknowledged: boolean;

  beforeEach(() => {
    localStorage.clear();
    renderSafetyHTML();
    inferenceService = new MockInferenceService();
    acknowledged = false;
  });

  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function createUI(): SafetyUI {
    return new SafetyUI({
      inferenceService: inferenceService as unknown as InferenceService,
      onAcknowledged: () => {
        acknowledged = true;
      },
    });
  }

  it("shows the safety modal when not acknowledged", async () => {
    const ui = createUI();
    const safetyModal = document.querySelector(
      "#safety-modal",
    ) as HTMLDialogElement;

    const initPromise = ui.init();
    expect(safetyModal.showModal).toHaveBeenCalled();

    const ack = document.querySelector("#safety-modal-ack") as HTMLInputElement;
    ack.checked = true;
    safetyModal
      .querySelector("#safety-form")!
      .dispatchEvent(new SubmitEvent("submit"));

    await initPromise;
    expect(acknowledged).toBe(true);
    expect(localStorage.getItem("ff:safety-ack-v1")).toBe("1");
  });

  it("skips the safety modal when already acknowledged", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    const safetyModal = document.querySelector(
      "#safety-modal",
    ) as HTMLDialogElement;

    await ui.init();
    expect(safetyModal.showModal).not.toHaveBeenCalled();
  });

  it("confirmClearHistory resolves true when accepted", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const promise = ui.confirmClearHistory();
    const acceptBtn = document.querySelector(
      "#clear-confirm-accept",
    ) as HTMLButtonElement;
    acceptBtn.click();

    const result = await promise;
    expect(result).toBe(true);
  });

  it("confirmClearHistory resolves false when cancelled", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const promise = ui.confirmClearHistory();
    const cancelBtn = document.querySelector(
      "#clear-confirm-cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();

    const result = await promise;
    expect(result).toBe(false);
  });

  it("gates dima806 model selection until confirmed", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = ModelKey.Dima806;
    select.dispatchEvent(new Event("change"));

    expect(select.value).toBe(ModelKey.BVRA);
  });

  it("allows dima806 after confirmation", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    const acceptBtn = document.querySelector(
      "#model-confirm-accept",
    ) as HTMLButtonElement;

    select.value = ModelKey.Dima806;
    select.dispatchEvent(new Event("change"));
    acceptBtn.click();

    expect(select.value).toBe(ModelKey.Dima806);
  });

  it("shows storage confirmation when the service emits storageConfirm", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const modal = document.querySelector(
      "#storage-confirm-modal",
    ) as HTMLDialogElement;
    inferenceService.emitStorageConfirm({
      modelKey: ModelKey.Dima806,
      freeBytes: 100 * 1024 * 1024,
      token: "token-123",
    });

    expect(modal.showModal).toHaveBeenCalled();

    const acceptBtn = document.querySelector(
      "#storage-confirm-accept",
    ) as HTMLButtonElement;
    acceptBtn.click();

    expect(inferenceService.resumeStorageConfirm).toHaveBeenCalledWith(
      "token-123",
    );
  });
});
