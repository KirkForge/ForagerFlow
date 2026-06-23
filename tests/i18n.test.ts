import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  t,
  setLocale,
  getLocale,
  initLocale,
  detectLocale,
  applyStaticI18n,
  type Locale,
} from "@/i18n";

describe("i18n", () => {
  beforeEach(() => {
    setLocale("da");
  });

  it("returns Danish text by default", () => {
    expect(t("app.title")).toBe("ForagerFlow");
    expect(t("history.title")).toBe("Historik");
  });

  it("falls back to English for unknown keys", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("switches locale", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t("history.title")).toBe("History");
  });

  it("interpolates parameters", () => {
    expect(t("status.error", { message: "foo" })).toBe("Fejl: foo");
  });

  it("detects Danish from navigator.language", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "da-DK" },
      writable: true,
      configurable: true,
    });
    expect(detectLocale()).toBe("da");
  });

  it("detects English from navigator.language", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "en-US" },
      writable: true,
      configurable: true,
    });
    expect(detectLocale()).toBe("en");
  });

  it("initializes locale from argument", () => {
    expect(initLocale("en" as Locale)).toBe("en");
    expect(getLocale()).toBe("en");
  });

  it("falls back to default when localStorage is unavailable", () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "da-DK" },
      writable: true,
      configurable: true,
    });
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });
    expect(initLocale()).toBe("da");
    spy.mockRestore();
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("detects default locale when navigator is missing", () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(detectLocale()).toBe("da");
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it("detects default locale when navigator languages are empty", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "", userLanguage: "" },
      writable: true,
      configurable: true,
    });
    expect(detectLocale()).toBe("da");
  });

  it("applies static i18n to elements", () => {
    document.body.innerHTML = `
      <span data-i18n-key="history.title"></span>
      <span data-i18n-key="app.title" data-i18n-attr="aria-label"></span>
      <span data-i18n-key="">keep</span>
    `;
    setLocale("en", false);
    applyStaticI18n();

    const [title, aria, keep] = Array.from(document.querySelectorAll("span")) as [
      HTMLSpanElement,
      HTMLSpanElement,
      HTMLSpanElement,
    ];
    expect(title.textContent).toBe("History");
    expect(aria.getAttribute("aria-label")).toBe("ForagerFlow");
    expect(keep.textContent).toBe("keep");
  });
});
