import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const init = vi.fn().mockResolvedValue(undefined);
const MockAppController = vi.fn(function () {
  return { init };
});

vi.mock("@/app", () => ({
  AppController: MockAppController,
}));

describe("main bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = `<div id="status"></div>`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("instantiates AppController and calls init", async () => {
    await import("@/main");
    await flushPromises();
    expect(MockAppController).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("displays error message when init fails", async () => {
    init.mockRejectedValueOnce(new Error("boot failed"));
    await import("@/main");
    await flushPromises();

    const status = document.getElementById("status");
    expect(status?.textContent).toBe("Failed to initialize. Please reload.");
  });
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
