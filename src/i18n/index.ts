import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  type Locale,
  type Messages,
  isLocale,
  normalizeLocale,
} from "./types";
import { messagesByLocale } from "./messages";

let currentLocale: Locale = DEFAULT_LOCALE;

export type { Locale } from "./types";

function loadMessages(locale: Locale): Messages {
  return messagesByLocale[locale];
}

function storedLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures (e.g. private mode).
  }
}

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }
  const nav = navigator as Navigator & { userLanguage?: string };
  const navLang = nav.language || nav.userLanguage;
  if (navLang) {
    return normalizeLocale(navLang);
  }
  return DEFAULT_LOCALE;
}

export function initLocale(preferred?: Locale): Locale {
  const locale = preferred ?? storedLocale() ?? detectLocale();
  setLocale(locale, false);
  applyStaticI18n();
  return locale;
}

export function applyStaticI18n(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-i18n-key]").forEach((el) => {
    const key = el.getAttribute("data-i18n-key");
    if (!key) return;
    const attr = el.getAttribute("data-i18n-attr");
    const text = t(key);
    if (attr) {
      el.setAttribute(attr, text);
    } else {
      el.textContent = text;
    }
  });
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale, persist = true): void {
  currentLocale = locale;
  if (persist) {
    persistLocale(locale);
  }
  // Reflect in the HTML lang attribute for accessibility / screen readers.
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const messages = loadMessages(currentLocale);
  let text = messages[key];
  if (text === undefined) {
    const fallback = loadMessages(FALLBACK_LOCALE);
    text = fallback[key];
  }
  if (text === undefined) {
    return key;
  }
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_match, paramKey: string) => {
    const value = params[paramKey];
    return value !== undefined ? String(value) : `{{${paramKey}}}`;
  });
}
