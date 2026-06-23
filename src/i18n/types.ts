export type Locale = "da" | "en";

export type Messages = Record<string, string>;

export const DEFAULT_LOCALE: Locale = "da";
export const FALLBACK_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES: Locale[] = ["da", "en"];
export const LOCALE_STORAGE_KEY = "ff:locale-v1";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale)
  );
}

export function normalizeLocale(value: string): Locale {
  const lower = value.toLowerCase();
  if (lower.startsWith("da")) return "da";
  return "en";
}
