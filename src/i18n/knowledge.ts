import type { SpeciesKnowledge } from "@/core/types";
import { getLocale } from "./index";
import type { Locale } from "./types";

export function getLocalizedNotes(
  knowledge: SpeciesKnowledge,
  locale: Locale = getLocale(),
): string {
  return knowledge.localizedNotes?.[locale] ?? knowledge.notes;
}
