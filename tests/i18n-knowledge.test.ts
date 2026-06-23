import { describe, it, expect, beforeEach } from "vitest";
import { getLocalizedNotes } from "@/i18n/knowledge";
import { setLocale } from "@/i18n";
import { Edibility } from "@/core/types";

describe("getLocalizedNotes", () => {
  beforeEach(() => {
    setLocale("da");
  });

  it("returns localized notes when available", () => {
    const knowledge = {
      edibility: Edibility.Edible,
      notes: "English notes.",
      localizedNotes: { da: "Danske noter.", en: "English notes." },
    };
    expect(getLocalizedNotes(knowledge)).toBe("Danske noter.");
    expect(getLocalizedNotes(knowledge, "en")).toBe("English notes.");
  });

  it("falls back to base notes when localized notes are missing", () => {
    const knowledge = {
      edibility: Edibility.Unknown,
      notes: "Base notes.",
    };
    expect(getLocalizedNotes(knowledge)).toBe("Base notes.");
  });

  it("falls back to base notes for unsupported locale", () => {
    const knowledge = {
      edibility: Edibility.Poisonous,
      notes: "Base notes.",
      localizedNotes: { da: "Danske noter." },
    };
    expect(getLocalizedNotes(knowledge, "en")).toBe("Base notes.");
  });
});
