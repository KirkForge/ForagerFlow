import { describe, it, expect, beforeEach } from "vitest";
import { getSafetyLinks, applySafetyLinks } from "@/i18n/safety";
import { setLocale } from "@/i18n";

describe("getSafetyLinks", () => {
  it("returns Danish resources for da", () => {
    const links = getSafetyLinks("da");
    expect(links.mycologist).toBe("https://www.svampeforeningen.dk/");
    expect(links.poisonControl).toBe("https://www.giftlinjen.dk/");
    expect(links.poisonControlLabel).toBe("Giftlinjen");
  });

  it("returns generic English resources for en", () => {
    const links = getSafetyLinks("en");
    expect(links.mycologist).toContain("google.com");
    expect(links.poisonControl).toBeNull();
  });
});

describe("applySafetyLinks", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <a id="find-mycologist-link" href="#">Mycologist</a>
      <a id="poison-control-link" href="#" style="display: none">Poison</a>
    `;
  });

  it("sets Danish mycologist link and shows Giftlinjen", () => {
    setLocale("da");
    applySafetyLinks();
    const myco = document.getElementById(
      "find-mycologist-link",
    ) as HTMLAnchorElement;
    const poison = document.getElementById(
      "poison-control-link",
    ) as HTMLAnchorElement;
    expect(myco.href).toBe("https://www.svampeforeningen.dk/");
    expect(poison.style.display).not.toBe("none");
    expect(poison.href).toBe("https://www.giftlinjen.dk/");
    expect(poison.textContent).toBe("Giftlinjen");
  });

  it("hides poison control link for English", () => {
    setLocale("en");
    applySafetyLinks();
    const poison = document.getElementById(
      "poison-control-link",
    ) as HTMLAnchorElement;
    expect(poison.style.display).toBe("none");
  });
});
