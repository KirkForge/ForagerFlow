import { describe, it, expect } from "vitest";
import { getEdibilityClass, createEl } from "@/ui/utils";

describe("ui/utils", () => {
  describe("getEdibilityClass", () => {
    it("returns poisonous class for Poisonous", () => {
      expect(getEdibilityClass("Poisonous")).toBe("edibility-poisonous");
    });

    it("returns edible class for Edible", () => {
      expect(getEdibilityClass("Edible")).toBe("edibility-edible");
    });

    it("returns unknown class for Unknown", () => {
      expect(getEdibilityClass("Unknown")).toBe("edibility-unknown");
    });

    it("returns unknown class for unexpected input", () => {
      expect(getEdibilityClass("")).toBe("edibility-unknown");
    });
  });

  describe("createEl", () => {
    it("creates an element with class and text", () => {
      const el = createEl("div", "cls", "txt");
      expect(el.tagName).toBe("DIV");
      expect(el.className).toBe("cls");
      expect(el.textContent).toBe("txt");
    });

    it("creates an element without optional arguments", () => {
      const el = createEl("span");
      expect(el.tagName).toBe("SPAN");
      expect(el.className).toBe("");
      expect(el.textContent).toBe("");
    });

    it("creates an element with empty text", () => {
      const el = createEl("p", undefined, "");
      expect(el.textContent).toBe("");
    });
  });
});
