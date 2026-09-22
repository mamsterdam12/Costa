import type { PageResult } from "./lib/fetcher";

export type ScrapedEvent = {
  // Stable id for this event at the source (its detail URL or the
  // source's own id), so a re-scrape matches the same row again.
  externalId: string;
  title: string;
  description: string;
  startsAt: Date;
  /** True only when the source stated an hour, not just a date. */
  startTimeKnown?: boolean;
  endsAt?: Date;
  venueName?: string;
  address?: string;
  // The event's own detail page -- never the listing page.
  sourceUrl: string;
  costType?: "FREE" | "PAID" | "UNKNOWN";
  costAmount?: string;
  /** The source's own picture of this event, best guess first. */
  imageUrls?: string[];
};

// A scraper is configuration, not machinery: fetching, politeness,
// caching, bot-challenge handling, the extraction ladder and the database
// writes are all shared (lib/fetcher.ts, lib/extract.ts, run.ts). Most
// sources need nothing but the fields below; `extract` is there for the
// ones whose markup nothing generic can read.
export type Scraper = {
  /** Matches Source.sourceType: that's how a Source selects its parser. */
  sourceType: string;
  name: string;
  description: string;
  /** Language the source publishes in; becomes Event.sourceLocale. */
  sourceLocale: "nl" | "en" | "es";
  /** Used when no keyword rule matches (see run.ts). */
  defaultCategorySlug: string;
  // A single-venue source knows where its events happen and who runs
  // them, even though the listing never repeats it on each entry. Used
  // as a fallback when the scraped event doesn't carry its own.
  venueName?: string;
  address?: string;
  /** Slug of an existing Organizer row to attach these events to. */
  organizerSlug?: string;
  /** Extra pages to read besides Source.url, relative to it. */
  extraPaths?: string[];
  /** Source-specific extraction, tried before the shared ladder. */
  extract?: (page: PageResult) => ScrapedEvent[];
};
