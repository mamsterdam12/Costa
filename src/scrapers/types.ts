export type ScrapedEvent = {
  // Stable id for this event at the source (its detail URL or the
  // source's own id), so a re-scrape matches the same row again.
  externalId: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt?: Date;
  venueName?: string;
  address?: string;
  // The event's own detail page -- never the listing page.
  sourceUrl: string;
  costType?: "FREE" | "PAID" | "UNKNOWN";
  costAmount?: string;
};

export type ScrapeResult = {
  events: ScrapedEvent[];
  // Which strategy produced these (e.g. "json-ld", "tribe-rest-api",
  // "html-heuristic"); recorded on the Source so it's visible where the
  // data came from and how much to trust it.
  strategy: string;
  // Heuristic strategies are not trusted enough to publish unreviewed.
  confidence: "high" | "low";
  notes: string[];
  // Structural description of the fetched pages, filled in when nothing
  // was found so the failure leaves clues in the logs (see lib/diagnose.ts).
  diagnostics?: string[];
  // Set when the source refused us (bot protection, rate limit) rather
  // than simply having no events -- a very different thing to report.
  blockedReason?: string;
};

export type Scraper = {
  // Matches Source.sourceType: that's how a Source selects its parser.
  sourceType: string;
  name: string;
  description: string;
  // Language the source publishes in; becomes Event.sourceLocale.
  sourceLocale: "nl" | "en" | "es";
  // Used when no keyword rule matches (see run.ts).
  defaultCategorySlug: string;
  run(source: { url: string }): Promise<ScrapeResult>;
};
