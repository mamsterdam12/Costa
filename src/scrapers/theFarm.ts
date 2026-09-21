import type { ScrapedEvent, Scraper, ScrapeResult } from "./types";
import { fetchJson, fetchText } from "./lib/http";
import { extractJsonLdEvents } from "./lib/jsonld";
import { absoluteUrl, stripTags } from "./lib/html";
import { diagnosePage } from "./lib/diagnose";

// The Farm Marbella (thefarm-marbella.com): a WordPress site with a
// "What's On" page plus an /upcoming-events/ calendar. The site couldn't
// be inspected from the development sandbox (its domain is blocked
// there), so rather than hard-coding one HTML layout this tries, in
// order of reliability:
//   1. schema.org Event JSON-LD on the listing pages (what most WP event
//      calendars emit) -- structured, trusted, published directly;
//   2. The Events Calendar's REST API, if that plugin is what runs the
//      calendar -- also structured and trusted;
//   3. a conservative HTML heuristic (<time datetime> next to a heading)
//      -- low confidence, so its results come in as DRAFT and the
//      Source is flagged for review.
// If all three find nothing, the run reports that and the Source is
// flagged, per the design: a failing script is marked for a person or
// an AI agent to look at, it doesn't guess.
export const theFarmScraper: Scraper = {
  sourceType: "the-farm",
  name: "The Farm Marbella",
  description: "What's On / upcoming events at The Farm, Marbella old town (JSON-LD, then WP events API, then HTML).",
  sourceLocale: "en",
  defaultCategorySlug: "muziek-uitgaan",

  async run(source) {
    const notes: string[] = [];
    const origin = new URL(source.url).origin;
    const pages = [source.url, `${origin}/upcoming-events/`];

    // 1. JSON-LD
    const jsonLd: ScrapedEvent[] = [];
    const fetched = new Map<string, string>();
    for (const page of pages) {
      try {
        const html = await fetchText(page);
        fetched.set(page, html);
        const found = extractJsonLdEvents(html, page);
        notes.push(`${page}: ${found.length} JSON-LD event(s)`);
        jsonLd.push(...found);
      } catch (err) {
        notes.push(`${page}: fetch failed (${err instanceof Error ? err.message : err})`);
      }
    }
    if (jsonLd.length > 0) {
      return { events: dedupe(jsonLd), strategy: "json-ld", confidence: "high", notes };
    }

    // 2. The Events Calendar REST API
    try {
      const api = `${origin}/wp-json/tribe/events/v1/events?per_page=50`;
      const data = await fetchJson<TribeResponse>(api);
      const events = (data.events ?? []).map((e) => tribeToEvent(e, origin)).filter(isEvent);
      notes.push(`tribe REST API: ${events.length} event(s)`);
      if (events.length > 0) {
        return { events, strategy: "tribe-rest-api", confidence: "high", notes };
      }
    } catch (err) {
      notes.push(`tribe REST API: unavailable (${err instanceof Error ? err.message : err})`);
    }

    // 3. HTML heuristic
    for (const [page, html] of fetched) {
      const events = heuristicEvents(html, page);
      notes.push(`${page}: ${events.length} heuristic event(s)`);
      if (events.length > 0) {
        return { events, strategy: "html-heuristic", confidence: "low", notes };
      }
    }

    const diagnostics = [...fetched].flatMap(([page, html]) => diagnosePage(page, html));
    return { events: [], strategy: "none", confidence: "low", notes, diagnostics };
  },
};

type TribeEvent = {
  id: number;
  title?: string;
  description?: string;
  url?: string;
  start_date?: string;
  end_date?: string;
  cost?: string;
  venue?: { venue?: string; address?: string; city?: string };
};
type TribeResponse = { events?: TribeEvent[] };

function tribeToEvent(e: TribeEvent, origin: string): ScrapedEvent | null {
  const startsAt = e.start_date ? new Date(e.start_date.replace(" ", "T")) : undefined;
  const title = e.title ? stripTags(e.title) : "";
  if (!startsAt || isNaN(startsAt.getTime()) || !title) return null;
  const sourceUrl = e.url ? absoluteUrl(e.url, origin) : `${origin}/?p=${e.id}`;
  const endsAt = e.end_date ? new Date(e.end_date.replace(" ", "T")) : undefined;
  const cost = e.cost?.trim();
  return {
    externalId: String(e.id),
    title,
    description: stripTags(e.description ?? ""),
    startsAt,
    endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
    venueName: e.venue?.venue,
    address: [e.venue?.address, e.venue?.city].filter(Boolean).join(", ") || undefined,
    sourceUrl,
    costType: !cost ? "UNKNOWN" : /free|gratis/i.test(cost) || cost === "0" ? "FREE" : "PAID",
    costAmount: cost && !/free|gratis/i.test(cost) && cost !== "0" ? cost : undefined,
  };
}

function isEvent(e: ScrapedEvent | null): e is ScrapedEvent {
  return e !== null;
}

// Looks for <time datetime="..."> and pairs each with the nearest heading
// before it and the nearest link around it. Deliberately simple: it only
// has to be good enough to surface *something* for a person to review.
function heuristicEvents(html: string, pageUrl: string): ScrapedEvent[] {
  const events: ScrapedEvent[] = [];
  const timeRe = /<time[^>]*datetime=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = timeRe.exec(html))) {
    const startsAt = new Date(m[1]);
    if (isNaN(startsAt.getTime())) continue;
    const before = html.slice(Math.max(0, m.index - 2500), m.index);
    const headings = [...before.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
    const title = headings.length ? stripTags(headings[headings.length - 1][1]) : "";
    if (!title) continue;
    const links = [...before.matchAll(/<a[^>]*href=["']([^"']+)["']/gi)];
    const href = links.length ? links[links.length - 1][1] : pageUrl;
    const sourceUrl = absoluteUrl(href, pageUrl);
    events.push({
      externalId: sourceUrl === pageUrl ? `${pageUrl}#${title}` : sourceUrl,
      title,
      description: "",
      startsAt,
      sourceUrl,
      costType: "UNKNOWN",
    });
  }
  return dedupe(events);
}

function dedupe(events: ScrapedEvent[]): ScrapedEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.externalId}|${e.startsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
