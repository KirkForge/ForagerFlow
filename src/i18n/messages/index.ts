import { daMessages } from "./da";
import { enMessages } from "./en";

export { daMessages, enMessages };

export const messagesByLocale = {
  da: daMessages,
  en: enMessages,
} as const;
