export const locales = ["nl", "en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "nl";

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

// Translated text is stored as JSON, e.g. { "nl": "...", "en": "...", "es": "..." }.
// Falls back to the default locale, then to whichever translation exists,
// so a partially translated row (e.g. freshly scraped, not yet translated)
// still renders instead of showing nothing.
export function translate(value: unknown, locale: Locale): string {
  if (!value || typeof value !== "object") return "";
  const dict = value as Record<string, string>;
  return dict[locale] || dict[defaultLocale] || Object.values(dict)[0] || "";
}
