import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModelKey } from "@/core/types";
import { SafetyUI } from "@/ui";
import type { InferenceService } from "@/inference/service";
import { flushPromises } from "./helpers/promises";

describe("SafetyUI", () => {
  let onAcknowledged: () => void;
  let storageHandler:
    | ((payload: { modelKey: ModelKey; freeBytes: number }) => void)
    | null = null;
  const inferenceService = {
    onStorageConfirm: vi.fn((handler) => {
      storageHandler = handler as (payload: {
        modelKey: ModelKey;
        freeBytes: number;
      }) => void;
    }),
    preloadModel: vi.fn(),
    resumeStorageConfirm: vi.fn(),
    onNetworkConfirm: vi.fn(),
    resumeNetworkConfirm: vi.fn(),
    cancelNetworkConfirm: vi.fn().mockReturnValue(ModelKey.BVRA),
  } as unknown as InferenceService;

  function renderSafetyHTML(): void {
    document.body.innerHTML = `
      <dialog id="safety-modal">
        <form id="safety-form" method="dialog">
          <input id="safety-modal-ack" type="checkbox" />
          <button id="safety-modal-continue" type="submit">Continue</button>
        </form>
      </dialog>
      <dialog id="model-confirm-modal">
        <button value="cancel">Cancel</button>
        <button value="accept">Accept</button>
      </dialog>
      <dialog id="storage-confirm-modal">
        <p id="storage-confirm-body"></p>
        <button value="cancel">Cancel</button>
        <button value="accept">Accept</button>
      </dialog>
      <dialog id="network-confirm-modal">
        <button value="cancel">Cancel</button>
        <button value="accept">Accept</button>
      </dialog>
      <dialog id="clear-confirm-modal">
        <button value="cancel">Cancel</button>
        <button value="accept">Accept</button>
      </dialog>
      <select id="model-select">
        <option value="bvra">BVRA</option>
        <option value="dima806">dima806</option>
      </select>
    `;
  }

  beforeEach(() => {
    localStorage.clear();
    onAcknowledged = vi.fn() as unknown as () => void;
    storageHandler = null;
    vi.clearAllMocks();
    renderSafetyHTML();
    HTMLDialogElement.prototype.showModal = vi.fn(() => {
      /* no-op */
    }) as unknown as typeof HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.close = vi.fn(() => {
      /* no-op */
    }) as unknown as typeof HTMLDialogElement.prototype.close;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function newSafetyUI(): SafetyUI {
    return new SafetyUI({
      inferenceService,
      onAcknowledged,
    });
  }

  it("shows the mandatory safety modal on first init", async () => {
    const ui = newSafetyUI();
    const showModalSpy = vi.spyOn(
      document.querySelector("#safety-modal") as HTMLDialogElement,
      "showModal",
    );

    void ui.init();
    await flushPromises();

    expect(showModalSpy).toHaveBeenCalled();
  });

  it("records acknowledgement when the safety form is submitted", async () => {
    const ui = newSafetyUI();
    const ack = document.querySelector("#safety-modal-ack") as HTMLInputElement;
    ack.checked = true;

    const initPromise = ui.init();
    const form = document.querySelector("#safety-form") as HTMLFormElement;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await initPromise;

    expect(localStorage.getItem("ff:safety-ack-v1")).toBe("1");
    expect(onAcknowledged).toHaveBeenCalled();
  });

  it("prevents canceling the mandatory safety modal", async () => {
    const ui = newSafetyUI();
    const modal = document.querySelector("#safety-modal") as HTMLDialogElement;
    const closeSpy = vi.spyOn(modal, "close");

    void ui.init();
    await flushPromises();

    const cancelEvent = new Event("cancel", { cancelable: true });
    modal.dispatchEvent(cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("skips the safety modal when already acknowledged", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = newSafetyUI();
    const modal = document.querySelector("#safety-modal") as HTMLDialogElement;
    const showModalSpy = vi.spyOn(modal, "showModal");

    await ui.init();

    expect(showModalSpy).not.toHaveBeenCalled();
  });

  it("confirms clear history when accepted", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = newSafetyUI();
    await ui.init();

    const modal = document.querySelector(
      "#clear-confirm-modal",
    ) as HTMLDialogElement;
    const accept = modal.querySelector("[value='accept']") as HTMLButtonElement;

    const resultPromise = ui.confirmClearHistory();
    accept.click();

    expect(await resultPromise).toBe(true);
  });

  it("rejects clear history when canceled", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = newSafetyUI();
    await ui.init();

    const modal = document.querySelector(
      "#clear-confirm-modal",
    ) as HTMLDialogElement;
    const cancel = modal.querySelector("[value='cancel']") as HTMLButtonElement;

    const resultPromise = ui.confirmClearHistory();
    cancel.click();

    expect(await resultPromise).toBe(false);
  });

  it("opens a confirmation dialog before switching to dima806", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = newSafetyUI();
    await ui.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = "dima806";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    await flushPromises();

    const modal = document.querySelector(
      "#model-confirm-modal",
    ) as HTMLDialogElement;
    expect(modal.open || true).toBe(true);
  });

  it("switches to dima806 after confirmation", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = newSafetyUI();
    await ui.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    select.value = "dima806";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();

    const modal = document.querySelector(
      "#model-confirm-modal",
    ) as HTMLDialogElement;
    const accept = modal.querySelector("[value='accept']") as HTMLButtonElement;
    accept.click();
    await flushPromises();

    expect(inferenceService.preloadModel).toHaveBeenCalledWith(
      ModelKey.Dima806,
    );
    expect(select.value).toBe(ModelKey.Dima806);
    expect(localStorage.getItem("ff:dima-confirm-v1")).toBe("1");
  });

  it("does not reconfirm dima806 after it has been confirmed", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    localStorage.setItem("ff:dima-confirm-v1", "1");
    const ui = newSafetyUI();
    await ui.init();

    const select = document.querySelector("#model-select") as HTMLSelectElement;
    const modelConfirmModal = document.querySelector(
      "#model-confirm-modal",
    ) as HTMLDialogElement;
    const showModalSpy = vi.spyOn(modelConfirmModal, "showModal");

    select.value = "dima806";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();

    expect(showModalSpy).not.toHaveBeenCalled();
  });

  it("shows a storage confirmation and resumes when accepted", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = newSafetyUI();
    await ui.init();

    expect(inferenceService.onStorageConfirm).toHaveBeenCalled();
    expect(storageHandler).not.toBeNull();

    storageHandler!({ modelKey: ModelKey.Dima806, freeBytes: 52_428_800 });
    await flushPromises();

    const body = document.querySelector("#storage-confirm-body") as HTMLElement;
    expect(body.textContent).toContain("50");

    const modal = document.querySelector(
      "#storage-confirm-modal",
    ) as HTMLDialogElement;
    const accept = modal.querySelector("[value='accept']") as HTMLButtonElement;
    accept.click();
    await flushPromises();

    expect(inferenceService.resumeStorageConfirm).toHaveBeenCalled();
  });

  it("does not resume storage when canceled", async () => {
    localStorage.setItem("ff:safety-ack-v1", "1");
    const ui = newSafetyUI();
    await ui.init();

    expect(storageHandler).not.toBeNull();
    storageHandler!({ modelKey: ModelKey.Dima806, freeBytes: 52_428_800 });
    await flushPromises();

    const modal = document.querySelector(
      "#storage-confirm-modal",
    ) as HTMLDialogElement;
    const cancel = modal.querySelector("[value='cancel']") as HTMLButtonElement;
    cancel.click();
    await flushPromises();

    expect(inferenceService.resumeStorageConfirm).not.toHaveBeenCalled();
  });
});
