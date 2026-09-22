import type { ScrapedEvent, Scraper } from "../types";
import type { PageResult } from "./fetcher";
import { fetchPage } from "./fetcher";
import { extractJsonLdEvents } from "./jsonld";
import { parseJetCalendar } from "./jetCalendar";
import { findFeedUrls, parseFeed } from "./feed";
import { parseUikitListing } from "./uikitListing";
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

  // 2. YOOtheme Pro listings (el-meta / el-title / el-content), which
  //     carry no <time>, no JSON-LD and no event-ish class names.
  if (/\bel-title\b/i.test(page.html) && /\bel-meta\b/i.test(page.html)) {
    const listing = parseUikitListing(page.html, page.url);
    notes.push(
      `${label}: yootheme listing, ${listing.events.length} event(s)` +
        (listing.undated ? `, ${listing.undated} without a readable date` : "") +
        (listing.unlinked ? `, ${listing.unlinked} without their own URL` : "") +
        (listing.events[0] ? `, first: "${listing.events[0].title}" -> ${listing.events[0].sourceUrl}` : "") +
        // When nothing links, show what the page did offer -- that is
        // what a next pass needs in order to fix the matching.
        (listing.unlinked && listing.linkCandidates.length
          ? `, links near the first entry: ${listing.linkCandidates.join(" ")}`
          : "")
    );
    if (listing.events.length) {
      return { events: dedupe(listing.events), strategy: "yootheme-listing", confidence: "high", notes };
    }
  }

  // 3. The Events Calendar REST API -- only if the page shows the plugin
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

  // 4. An RSS/Atom feed, when the page advertises one: smaller than the
  //     page, stable across redesigns, and it carries each item's own URL.
  for (const feedUrl of findFeedUrls(page.html, page.url).slice(0, 2)) {
    try {
      const feed = await fetchPage(feedUrl, { maxAgeMs: 60 * 60 * 1000 });
      const parsed = parseFeed(feed.html, feed.url);
      notes.push(
        `feed ${new URL(feedUrl).pathname}${new URL(feedUrl).search}: ${parsed.items} item(s), ` +
          `${parsed.events.length} dated${parsed.undated ? `, ${parsed.undated} without a usable date` : ""}`
      );
      if (parsed.events.length) {
        return { events: dedupe(parsed.events), strategy: "feed", confidence: "high", notes };
      }
    } catch (err) {
      notes.push(`feed ${feedUrl}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 5. JetEngine (Crocoblock) listing calendar: a month grid whose dates
  //    live in the caption, not in the entries.
  if (/jet-calendar/i.test(page.html)) {
    const cal = parseJetCalendar(page.html, page.url);
    notes.push(
      `${label}: jet-calendar ${cal.label}, ${cal.events.length} event(s)` +
        (cal.events[0] ? `, first: "${cal.events[0].title}" -> ${cal.events[0].sourceUrl}` : "") +
        (cal.events.some((e) => e.sourceUrl === page.url)
          ? cal.linkCandidates.length
            ? `, links in the first entry: ${cal.linkCandidates.join(" ")}`
            : // No link anywhere in the entry: show the markup itself, so
              // the question "does this site even have event pages?" gets
              // an answer instead of another guess.
              `, no link in any entry; first entry reads ${JSON.stringify(cal.entrySample)}`
          : "")
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

  // 6. Last resort: <time datetime> next to a heading. Never trusted
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
