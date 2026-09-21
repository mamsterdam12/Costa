export const locales = ["nl", "en", "es", "de", "fr", "sv", "da"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "nl";

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

// Fixed app chrome (buttons, empty states) -- hand-translated once, not
// routed through the Translation cache/LLM like content is, since it never
// changes and there are only a handful of short strings.
export const ui = {
  all: { nl: "Alles", en: "All", es: "Todo", de: "Alle", fr: "Tout", sv: "Alla", da: "Alle" },
  allCategories: {
    nl: "Alle categorieën",
    en: "All categories",
    es: "Todas las categorías",
    de: "Alle Kategorien",
    fr: "Toutes les catégories",
    sv: "Alla kategorier",
    da: "Alle kategorier",
  },
  noEvents: {
    nl: "Geen events gevonden voor dit filter.",
    en: "No events found for this filter.",
    es: "No se han encontrado eventos para este filtro.",
    de: "Keine Events für diesen Filter gefunden.",
    fr: "Aucun événement trouvé pour ce filtre.",
    sv: "Inga evenemang hittades för det här filtret.",
    da: "Ingen events fundet for dette filter.",
  },
  startDate: {
    nl: "Begindatum",
    en: "Start date",
    es: "Fecha de inicio",
    de: "Startdatum",
    fr: "Date de début",
    sv: "Startdatum",
    da: "Startdato",
  },
  endDate: {
    nl: "Einddatum",
    en: "End date",
    es: "Fecha de fin",
    de: "Enddatum",
    fr: "Date de fin",
    sv: "Slutdatum",
    da: "Slutdato",
  },
  location: {
    nl: "Locatie",
    en: "Location",
    es: "Ubicación",
    de: "Ort",
    fr: "Lieu",
    sv: "Plats",
    da: "Sted",
  },
  category: {
    nl: "Categorie",
    en: "Category",
    es: "Categoría",
    de: "Kategorie",
    fr: "Catégorie",
    sv: "Kategori",
    da: "Kategori",
  },
  source: {
    nl: "Bron",
    en: "Source",
    es: "Fuente",
    de: "Quelle",
    fr: "Source",
    sv: "Källa",
    da: "Kilde",
  },
} satisfies Record<string, Record<Locale, string>>;
