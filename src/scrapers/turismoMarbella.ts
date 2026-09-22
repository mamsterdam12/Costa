import type { Scraper } from "./types";

// The city's own tourism agenda (turismo.marbella.es/agenda.html): the
// broadest single source we have and the only one with content all year
// round, where the venue-specific sources go quiet out of season. It has
// real per-event pages (/agenda/<slug>.html), which is where an event's
// sourceUrl should point.
//
// Deliberately no venueName, address or organizerSlug: unlike The Farm
// this lists events across many venues and organisers, so filling those
// in from the source would be wrong for nearly every entry. Whatever the
// pages themselves state is what gets stored.
//
// No source-specific parsing either -- this is exactly what the shared
// ladder in lib/extract.ts is for. If none of its tiers fit this site,
// the run logs the page's real structure (lib/diagnose.ts) and the tier
// that's missing can be added there, where every other source gets it
// too.
export const turismoMarbellaScraper: Scraper = {
  sourceType: "turismo-marbella",
  name: "Ayuntamiento de Marbella (Turismo agenda)",
  description:
    "The city's official events agenda for Marbella, covering many venues year-round. Uses the shared extraction ladder: JSON-LD first, then the WP events API, the JetEngine calendar, and finally dated headings.",
  sourceLocale: "es",
  // Most of a city agenda is cultural; the keyword rules in run.ts move
  // sport, markets, food and nightlife entries out of this default.
  defaultCategorySlug: "cultuur",
};
