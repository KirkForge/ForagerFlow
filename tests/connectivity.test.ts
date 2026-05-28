import { describe, it, expect } from "vitest";
import { updateOnlineStatus } from "@/services/connectivity";

function createElement(): HTMLElement {
  const el = document.createElement("span");
  el.textContent = "";
  return el;
}

describe("updateOnlineStatus", () => {
  it("sets text to Online when navigator.onLine is true", () => {
    const badge = createElement();
    const origOnLine = navigator.onLine;
    updateOnlineStatus(badge);
    if (origOnLine) {
      expect(badge.textContent).toBe("Online");
    } else {
      expect(badge.textContent).toBe("Offline");
    }
  });

  it("sets color to accent when online", () => {
    const badge = createElement();
    updateOnlineStatus(badge);
    if (navigator.onLine) {
      expect(badge.style.color).toBe("var(--accent)");
    } else {
      expect(badge.style.color).toBe("var(--warn)");
    }
  });
});
