import type { Scraper } from "./types";
import { theFarmScraper } from "./theFarm";

// One entry per Source.sourceType that has a parser. A Source whose
// sourceType isn't listed here (e.g. the generic "html-listing" most
// registered sources still carry) simply has no script yet.
export const scrapers: Scraper[] = [theFarmScraper];

export function getScraper(sourceType: string): Scraper | undefined {
  return scrapers.find((s) => s.sourceType === sourceType);
}
