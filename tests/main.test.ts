import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises } from "./helpers/promises";

const errorMock = vi.fn();
const init = vi.fn().mockResolvedValue(undefined);
const recordCrashMock = vi.fn();
const MockAppController = vi.fn(function () {
  return { init };
});

vi.mock("@/app", () => ({
  AppController: MockAppController,
}));

vi.mock("@/core/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: errorMock,
  },
}));

vi.mock("@/core/telemetry", () => ({
  recordCrash: recordCrashMock,
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
  }, 10000);

  it("displays error message when init fails", async () => {
    init.mockRejectedValueOnce(new Error("boot failed"));
    await import("@/main");
    await flushPromises();

    const status = document.getElementById("status");
    expect(status?.textContent).toBe("Failed to initialize. Please reload.");
  });

  it("logs unhandled errors and shows status", async () => {
    errorMock.mockClear();
    await import("@/main");
    await flushPromises();

    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));

    expect(errorMock).toHaveBeenCalledWith(
      "Unhandled error:",
      expect.anything(),
    );
    expect(recordCrashMock).toHaveBeenCalledWith("boom", "window.error");
    const status = document.getElementById("status");
    expect(status?.textContent).toBe("Failed to initialize. Please reload.");
  });

  it("logs unhandled promise rejections and shows status", async () => {
    errorMock.mockClear();
    await import("@/main");
    await flushPromises();

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        reason: "rejected",
        promise: Promise.resolve(),
      }),
    );

    expect(errorMock).toHaveBeenCalledWith(
      "Unhandled promise rejection:",
      expect.anything(),
    );
    expect(recordCrashMock).toHaveBeenCalledWith(
      "rejected",
      "unhandledrejection",
    );
    const status = document.getElementById("status");
    expect(status?.textContent).toBe("Failed to initialize. Please reload.");
  });
});
