import type { ScrapedEvent, Scraper } from "../types";
import type { PageResult } from "./fetcher";
import { fetchPage } from "./fetcher";
import { extractJsonLdEvents } from "./jsonld";
import { parseJetCalendar } from "./jetCalendar";
import { absoluteUrl, stripTags } from "./html";

// The shared ladder every scraper gets, most structured first. Each tier
// only runs when the page shows evidence it applies, so a source that
// isn't a WordPress events site costs zero extra requests finding that
// out -- the thing that got us rate-limited in the first place.

export type ExtractionResult = {
  events: ScrapedEvent[];
  strategy: string;
  confidence: "high" | "low";
  notes: string[];
};

export async function extractEvents(page: PageResult, scraper: Scraper): Promise<ExtractionResult> {
  const notes: string[] = [];
  const label = new URL(page.requestedUrl).pathname;

  // 0. Anything the source itself knows how to read.
  if (scraper.extract) {
    const events = dedupe(scraper.extract(page));
    notes.push(`${label}: custom extractor, ${events.length} event(s)`);
    if (events.length) return { events, strategy: "custom", confidence: "high", notes };
  }

  // 1. schema.org Event JSON-LD: structured, unambiguous, free to read.
  const jsonLd = dedupe(extractJsonLdEvents(page.html, page.url));
  notes.push(`${label}: ${jsonLd.length} JSON-LD event(s)`);
  if (jsonLd.length) return { events: jsonLd, strategy: "json-ld", confidence: "high", notes };

  // 2. The Events Calendar REST API -- only if the page shows the plugin
  //    is installed, otherwise this is a wasted request against the host.
  if (/tribe-events|tribe_events|\/wp-json\/tribe/i.test(page.html)) {
    try {
      const origin = new URL(page.url).origin;
      const api = await fetchPage(`${origin}/wp-json/tribe/events/v1/events?per_page=50`, {
        maxAgeMs: 60 * 60 * 1000,
      });
      const events = dedupe(parseTribe(api.html, origin));
      notes.push(`tribe REST API: ${events.length} event(s)`);
      if (events.length) return { events, strategy: "tribe-rest-api", confidence: "high", notes };
    } catch (err) {
      notes.push(`tribe REST API: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 3. JetEngine (Crocoblock) listing calendar: a month grid whose dates
  //    live in the caption, not in the entries.
  if (/jet-calendar/i.test(page.html)) {
    const cal = parseJetCalendar(page.html, page.url);
    notes.push(
      `${label}: jet-calendar ${cal.label}, ${cal.events.length} event(s)` +
        (cal.events[0] ? `, first: "${cal.events[0].title}" -> ${cal.events[0].sourceUrl}` : "")
    );
    if (cal.events.length) {
      return {
        events: dedupe(cal.events),
        strategy: "jet-calendar",
        // A guessed month would file events under wrong dates; say so.
        confidence: cal.datesExplicit ? "high" : "low",
        notes,
      };
    }
  }

  // 4. Last resort: <time datetime> next to a heading. Never trusted
  //    enough to publish unreviewed.
  const guessed = dedupe(heuristicEvents(page.html, page.url));
  notes.push(`${label}: ${guessed.length} heuristic event(s)`);
  if (guessed.length) return { events: guessed, strategy: "html-heuristic", confidence: "low", notes };

  return { events: [], strategy: "none", confidence: "low", notes };
}

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

function parseTribe(json: string, origin: string): ScrapedEvent[] {
  let data: { events?: TribeEvent[] };
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const out: ScrapedEvent[] = [];
  for (const e of data.events ?? []) {
    const startsAt = e.start_date ? new Date(e.start_date.replace(" ", "T")) : undefined;
    const title = e.title ? stripTags(e.title) : "";
    if (!startsAt || isNaN(startsAt.getTime()) || !title) continue;
    const endsAt = e.end_date ? new Date(e.end_date.replace(" ", "T")) : undefined;
    const cost = e.cost?.trim();
    const free = !!cost && (/free|gratis/i.test(cost) || cost === "0");
    out.push({
      externalId: String(e.id),
      title,
      description: stripTags(e.description ?? ""),
      startsAt,
      endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : undefined,
      venueName: e.venue?.venue,
      address: [e.venue?.address, e.venue?.city].filter(Boolean).join(", ") || undefined,
      sourceUrl: e.url ? absoluteUrl(e.url, origin) : `${origin}/?p=${e.id}`,
      costType: !cost ? "UNKNOWN" : free ? "FREE" : "PAID",
      costAmount: cost && !free ? cost : undefined,
    });
  }
  return out;
}

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
  return events;
}

export function dedupe(events: ScrapedEvent[]): ScrapedEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.externalId}|${e.startsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
