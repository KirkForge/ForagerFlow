import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SafetyUI } from "@/ui/safety";
import { ModelKey } from "@/core/types";
import type { InferenceService } from "@/inference/service";

class MockInferenceService {
  resumeStorageConfirm = vi.fn();
  resumeNetworkConfirm = vi.fn();
  cancelNetworkConfirm = vi.fn().mockReturnValue(ModelKey.BVRA);
  preloadModel = vi.fn();
  private storageHandler:
    | ((payload: { modelKey: ModelKey; freeBytes: number }) => void)
    | null = null;
  private networkHandler:
    | ((payload: { modelKey: ModelKey }) => void)
    | null = null;

  onStorageConfirm(
    handler: (payload: { modelKey: ModelKey; freeBytes: number }) => void,
  ): void {
    this.storageHandler = handler;
  }

  emitStorageConfirm(payload: { modelKey: ModelKey; freeBytes: number }): void {
    this.storageHandler?.(payload);
  }

  onNetworkConfirm(handler: (payload: { modelKey: ModelKey }) => void): void {
    this.networkHandler = handler;
  }

  emitNetworkConfirm(payload: { modelKey: ModelKey }): void {
    this.networkHandler?.(payload);
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
      <button id="storage-confirm-accept" value="accept">Continue</button>
      <button id="storage-confirm-cancel" value="cancel">Cancel</button>
    </dialog>

    <dialog id="network-confirm-modal">
      <button id="network-confirm-accept" value="accept">Download anyway</button>
      <button id="network-confirm-cancel" value="cancel">Cancel</button>
    </dialog>

    <dialog id="clear-confirm-modal">
      <button id="clear-confirm-accept" value="accept">Clear</button>
      <button id="clear-confirm-cancel" value="cancel">Cancel</button>
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

    await vi.waitFor(() => {
      expect(select.value).toBe(ModelKey.Dima806);
    });
  });

  it("toggles the continue button when the acknowledgement checkbox changes", async () => {
    const ui = createUI();
    const safetyModal = document.querySelector(
      "#safety-modal",
    ) as HTMLDialogElement;

    const initPromise = ui.init();
    const ack = document.querySelector("#safety-modal-ack") as HTMLInputElement;
    const continueBtn = document.querySelector(
      "#safety-modal-continue",
    ) as HTMLButtonElement;

    // Starts disabled; checking + dispatching `change` enables it.
    expect(continueBtn.disabled).toBe(true);
    ack.checked = true;
    ack.dispatchEvent(new Event("change"));
    expect(continueBtn.disabled).toBe(false);
    ack.checked = false;
    ack.dispatchEvent(new Event("change"));
    expect(continueBtn.disabled).toBe(true);

    // Submit to settle initPromise.
    ack.checked = true;
    ack.dispatchEvent(new Event("change"));
    safetyModal
      .querySelector("#safety-form")!
      .dispatchEvent(new SubmitEvent("submit"));
    await initPromise;
  });

  it("shows the safety modal when localStorage.getItem throws (hasAcknowledged catch)", async () => {
    const getter = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    // hasAcknowledged throws → returns false → modal shown, no crash.
    const ui = createUI();
    const safetyModal = document.querySelector(
      "#safety-modal",
    ) as HTMLDialogElement;
    const initPromise = ui.init();
    expect(safetyModal.showModal).toHaveBeenCalled();

    // Triggering the dima806 change calls hasConfirmedDima806, whose getItem
    // also throws → catch returns false → confirm modal opens (covers 120).
    const select = document.querySelector("#model-select") as HTMLSelectElement;
    const modelConfirm = document.querySelector(
      "#model-confirm-modal",
    ) as HTMLDialogElement;
    select.value = ModelKey.Dima806;
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
      expect(modelConfirm.showModal).toHaveBeenCalled();
    });

    // Settle initPromise to avoid a dangling rejection; do not click accept.
    const ack = document.querySelector("#safety-modal-ack") as HTMLInputElement;
    ack.checked = true;
    safetyModal
      .querySelector("#safety-form")!
      .dispatchEvent(new SubmitEvent("submit"));
    await initPromise;
    getter.mockRestore();
  });

  it("tolerates localStorage.setItem failures (ack + dima806 confirm catch)", async () => {
    const getter = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key: string) =>
        key === "ff:dima-confirm-v1" ? "1" : null,
      );
    const setter = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    const ui = createUI();
    const safetyModal = document.querySelector(
      "#safety-modal",
    ) as HTMLDialogElement;
    const initPromise = ui.init();
    // hasAcknowledged → null → false → modal shown.
    expect(safetyModal.showModal).toHaveBeenCalled();

    // Submit: setItem throws → caught (87) → still resolves + acknowledges.
    const ack = document.querySelector("#safety-modal-ack") as HTMLInputElement;
    ack.checked = true;
    safetyModal
      .querySelector("#safety-form")!
      .dispatchEvent(new SubmitEvent("submit"));
    await initPromise;
    expect(acknowledged).toBe(true);

    // dima806 already "confirmed" in storage → markDima806Confirmed setItem
    // throws → caught (128). No confirm modal, no re-dispatch loop.
    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = ModelKey.Dima806;
    select.dispatchEvent(new Event("change"));
    expect(select.value).toBe(ModelKey.Dima806);

    getter.mockRestore();
    setter.mockRestore();
  });

  it("confirmClearHistory resolves false when the dialog is cancelled via Esc", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const promise = ui.confirmClearHistory();
    const modal = document.querySelector(
      "#clear-confirm-modal",
    ) as HTMLDialogElement;
    // Esc on an open <dialog> fires a `cancel` event — the SW-style handler
    // must preventDefault and resolve false (not leave the promise dangling).
    const event = new Event("cancel", { cancelable: true });
    modal.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const result = await promise;
    expect(result).toBe(false);
  });

  it("blocks submit and stays unacknowledged when the checkbox is unchecked", () => {
    const ui = createUI();
    // Do not await init: the once-listener returns early without resolving.
    void ui.init();
    const form = document.querySelector("#safety-form") as HTMLFormElement;
    const ev = new SubmitEvent("submit", { cancelable: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(acknowledged).toBe(false);
  });

  it("ignores model changes that do not select dima806", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();
    const select = document.querySelector("#model-select") as HTMLSelectElement;
    const modelConfirm = document.querySelector(
      "#model-confirm-modal",
    ) as HTMLDialogElement;
    select.value = ModelKey.BVRA;
    select.dispatchEvent(new Event("change"));
    expect(select.value).toBe(ModelKey.BVRA);
    expect(modelConfirm.showModal).not.toHaveBeenCalled();
  });

  it("leaves the model on BVRA when the dima806 confirm is cancelled", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();
    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = ModelKey.Dima806;
    select.dispatchEvent(new Event("change"));
    const cancelBtn = document.querySelector(
      "#model-confirm-cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();
    await vi.waitFor(() => {
      expect(select.value).toBe(ModelKey.BVRA);
    });
    expect(inferenceService.preloadModel).not.toHaveBeenCalled();
  });

  it("still opens the storage modal when the body element is absent", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();
    document.querySelector("#storage-confirm-body")?.remove();
    const modal = document.querySelector(
      "#storage-confirm-modal",
    ) as HTMLDialogElement;
    inferenceService.emitStorageConfirm({
      modelKey: ModelKey.Dima806,
      freeBytes: 100 * 1024 * 1024,
    });
    expect(modal.showModal).toHaveBeenCalled();
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
    });

    expect(modal.showModal).toHaveBeenCalled();

    const acceptBtn = document.querySelector(
      "#storage-confirm-accept",
    ) as HTMLButtonElement;
    acceptBtn.click();

    await vi.waitFor(() => {
      expect(inferenceService.resumeStorageConfirm).toHaveBeenCalled();
    });
  });

  it("shows the network modal when the service emits networkConfirm", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const modal = document.querySelector(
      "#network-confirm-modal",
    ) as HTMLDialogElement;
    inferenceService.emitNetworkConfirm({ modelKey: ModelKey.Dima806 });

    expect(modal.showModal).toHaveBeenCalled();

    const acceptBtn = document.querySelector(
      "#network-confirm-accept",
    ) as HTMLButtonElement;
    acceptBtn.click();

    await vi.waitFor(() => {
      expect(inferenceService.resumeNetworkConfirm).toHaveBeenCalled();
    });
  });

  it("reverts the model selector and cancels when the network modal is declined", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = createUI();
    await ui.init();

    const select = document.querySelector(
      "#model-select",
    ) as HTMLSelectElement;
    select.value = ModelKey.Dima806;

    inferenceService.emitNetworkConfirm({ modelKey: ModelKey.Dima806 });

    const cancelBtn = document.querySelector(
      "#network-confirm-cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();

    await vi.waitFor(() => {
      expect(inferenceService.cancelNetworkConfirm).toHaveBeenCalled();
    });
    expect(select.value).toBe(ModelKey.BVRA);
    expect(inferenceService.resumeNetworkConfirm).not.toHaveBeenCalled();
  });
});
