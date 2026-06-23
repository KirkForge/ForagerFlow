import { getLocale } from "./index";
import type { Locale } from "./types";

export interface SafetyLinks {
  mycologist: string;
  poisonControl: string | null;
  poisonControlLabel: string;
}

const linksByLocale: Record<Locale, SafetyLinks> = {
  da: {
    mycologist: "https://www.svampeforeningen.dk/",
    poisonControl: "https://www.giftlinjen.dk/",
    poisonControlLabel: "Giftlinjen",
  },
  en: {
    mycologist: "https://www.google.com/search?q=certified+mycologist+near+me",
    poisonControl: null,
    poisonControlLabel: "Poison control",
  },
};

export function getSafetyLinks(locale: Locale = getLocale()): SafetyLinks {
  return linksByLocale[locale];
}

export function applySafetyLinks(): void {
  if (typeof document === "undefined") return;
  const links = getSafetyLinks();

  const myco = document.getElementById("find-mycologist-link");
  if (myco && myco instanceof HTMLAnchorElement) {
    myco.href = links.mycologist;
  }

  const poison = document.getElementById("poison-control-link");
  if (poison && poison instanceof HTMLAnchorElement) {
    if (links.poisonControl) {
      poison.href = links.poisonControl;
      poison.textContent = links.poisonControlLabel;
      poison.style.display = "";
    } else {
      poison.style.display = "none";
    }
  }
}
