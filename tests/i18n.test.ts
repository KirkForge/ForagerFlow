import { describe, it, expect, beforeEach } from "vitest";
import {
  t,
  setLocale,
  getLocale,
  initLocale,
  detectLocale,
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
});
