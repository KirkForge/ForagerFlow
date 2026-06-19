import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerServiceWorker,
  updateOnlineStatus,
} from "@/services/connectivity";
import { logger } from "@/core/logger";
import { flushPromises } from "./helpers/promises";

describe("connectivity", () => {
  let originalServiceWorker: Navigator["serviceWorker"];
  let originalOnLine: boolean;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalServiceWorker = navigator.serviceWorker;
    originalOnLine = navigator.onLine;
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "serviceWorker", {
      value: originalServiceWorker,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
  });

  it("registers the service worker when supported", () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
      writable: true,
    });

    registerServiceWorker();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("logs a warning when service worker registration fails", async () => {
    const register = vi.fn().mockRejectedValue(new Error("network error"));
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
      writable: true,
    });

    registerServiceWorker();
    await flushPromises();

    expect(warnSpy).toHaveBeenCalledWith(
      "Service Worker registration failed: network error",
    );
  });

  it("does nothing when service worker is unsupported", () => {
    Reflect.deleteProperty(navigator, "serviceWorker");

    expect(registerServiceWorker).not.toThrow();
  });

  it("shows online badge when navigator.onLine is true", () => {
    const badge = document.createElement("span");
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });

    updateOnlineStatus(badge);
    expect(badge.textContent).toBe("Online");
    expect(badge.style.color).toBe("var(--accent)");
  });

  it("shows offline badge when navigator.onLine is false", () => {
    const badge = document.createElement("span");
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });

    updateOnlineStatus(badge);
    expect(badge.textContent).toBe("Offline");
    expect(badge.style.color).toBe("var(--warn)");
  });
});
