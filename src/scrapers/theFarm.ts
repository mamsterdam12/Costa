import type { Scraper } from "./types";

// The Farm Marbella (thefarm-marbella.com): WordPress + Elementor with a
// JetEngine month calendar -- no JSON-LD, no events plugin, no <time>
// elements, so the shared ladder's jet-calendar tier is what reads it.
// Nothing source-specific is needed beyond the venue details the calendar
// entries leave out ("Flamenco / Dinner Show / From 7.30PM" and no more).
//
// The host (SiteGround) challenges Railway's egress IPs on sight, so runs
// are often served from the stored snapshot rather than a live fetch;
// that's handled in lib/fetcher.ts, not here.
export const theFarmScraper: Scraper = {
  sourceType: "the-farm",
  name: "The Farm Marbella",
  description:
    "What's On / upcoming events at The Farm, Marbella old town. Reads their JetEngine month calendar; falls back to JSON-LD and the WP events API if the site ever changes.",
  sourceLocale: "en",
  defaultCategorySlug: "muziek-uitgaan",
  venueName: "The Farm Marbella",
  address: "Pl. Altamirano 3, 29601 Marbella, Málaga",
  organizerSlug: "the-farm-marbella",
};
