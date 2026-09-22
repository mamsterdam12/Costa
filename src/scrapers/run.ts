import { prisma } from "../lib/prisma";
import { getOrGenerateEventImageUrl } from "../lib/imageGeneration";
import { getScraper } from "./registry";
import type { ScrapedEvent } from "./types";
import { shortHash, slugify } from "./lib/html";
import { FetchRefused, fetchPage, type PageResult } from "./lib/fetcher";
import { extractEvents, type ExtractionResult } from "./lib/extract";
import { DATE_LIKE, diagnosePage, excerptsAroundPattern } from "./lib/diagnose";
import { extractDetails } from "./lib/detail";
import { atTimeInMarbella } from "./lib/dates";
import { importEventImage } from "../lib/imageImport";
import { marbellaDay, startOfTodayInMarbella } from "../lib/datetime";

export type RunSummary = {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  status: string;
  strategy?: string;
  created: number;
  updated: number;
  duplicates: number;
  /** Entries the listing still showed but that are already over. */
  skippedPast: number;
  notes: string[];
  /** No page was fetched live; everything came from stored snapshots. */
  fromCache?: boolean;
  /** Set when a live fetch was refused and a stored copy stood in. */
  degraded?: string;
  snapshotAgeMs?: number;
};

export type RunOptions = {
  /** Skip the snapshot and go to the origin (the "refresh" button). */
  force?: boolean;
};

// Deterministic category assignment, first rule that matches wins; the
// scraper's default is used when nothing matches. (The AI fallback tier
// from the design isn't built yet -- this is the keyword tier.)
const categoryRules: Array<[RegExp, string]> = [
  [/flamenco|\bdj\b|live music|concert|band|party|fiesta|m[uú]sica|karaoke|disco/i, "muziek-uitgaan"],
  [/dinner|brunch|lunch|breakfast|menu|tasting|wine|cocktail|cena|comida|desayuno|cata/i, "eten-drinken"],
  [/padel|tennis|golf|\brun\b|yoga|fitness|tournament|torneo|walk|hike/i, "sport-fitness"],
  [/market|mercadillo|shopping|fair|feria/i, "markten-shopping"],
  [/exhibition|exposici[oó]n|museum|museo|\bart\b|theatre|teatro|festival/i, "cultuur"],
];

function pickCategorySlug(ev: ScrapedEvent, fallback: string): string {
  const text = `${ev.title} ${ev.description}`;
  for (const [re, slug] of categoryRules) if (re.test(text)) return slug;
  return fallback;
}

function makeSlug(ev: ScrapedEvent): string {
  return `${slugify(ev.title).slice(0, 60)}-${marbellaDay(ev.startsAt)}-${shortHash(ev.externalId)}`;
}

function normalizeTitle(title: string): string {
  return slugify(title).replace(/-/g, "");
}

// A listing says what is on and roughly when. The hour it starts, where
// it is, what it costs and the poster are all on the event's own page --
// which the source does publish, and which we were throwing away by
// reading only the overview. Detail pages are read through the same
// snapshot store as everything else, so this costs one request per event
// the first time and nothing on later runs.
const MAX_DETAIL_PAGES = 40;
const DETAIL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function addDetails(
  events: ScrapedEvent[],
  listingUrls: Set<string>,
  summary: RunSummary,
  force?: boolean
): Promise<void> {
  let read = 0;
  const gained = { time: 0, place: 0, price: 0, text: 0, image: 0 };
  // A host that refuses one detail page refuses all of them; asking
  // twenty more times is both pointless and rude.
  const refusing = new Set<string>();
  for (const ev of events) {
    if (read >= MAX_DETAIL_PAGES) break;
    if (ev.sourceUrl && refusing.has(new URL(ev.sourceUrl).host)) continue;
    if (!ev.sourceUrl || listingUrls.has(ev.sourceUrl)) continue;
    // Only ever the source's own site: a listing links out to ticket
    // shops and social media too, and those aren't ours to crawl.
    if (![...listingUrls].some((u) => new URL(u).host === new URL(ev.sourceUrl).host)) continue;

    try {
      const page = await fetchPage(ev.sourceUrl, { maxAgeMs: DETAIL_MAX_AGE_MS, force });
      read++;
      const details = extractDetails(page, ev.title);
      if (details.time) ev.startsAt = atTimeInMarbella(ev.startsAt, details.time);
      ev.venueName ??= details.venueName;
      ev.address ??= details.address;
      if ((ev.costType ?? "UNKNOWN") === "UNKNOWN" && details.costType && details.costType !== "UNKNOWN") {
        ev.costType = details.costType;
        ev.costAmount = details.costAmount;
      }
      if (details.description && details.description.length > ev.description.length) {
        ev.description = details.description;
      }
      if (!ev.imageUrls?.length) ev.imageUrls = details.imageUrls;
      if (details.time) gained.time++;
      if (details.venueName) gained.place++;
      if (details.costType && details.costType !== "UNKNOWN") gained.price++;
      if (details.description) gained.text++;
      if (details.imageUrls.length) gained.image++;
      if (read <= 2) summary.notes.push(`"${ev.title}" detail: ${details.found.join(", ") || "nothing"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof FetchRefused) {
        refusing.add(new URL(ev.sourceUrl).host);
        summary.notes.push(`detail pages on ${new URL(ev.sourceUrl).host} refused: ${err.detail}`);
      } else {
        summary.notes.push(`${ev.title}: detail page not read (${message})`);
      }
    }
  }
  if (read) {
    summary.notes.push(
      `detail pages: ${read} read -- ${gained.time} with a time, ${gained.place} with a place, ` +
        `${gained.price} with a price, ${gained.text} with a description, ${gained.image} with a picture`
    );
  }
}

// Runs the scraper registered for this Source's sourceType and writes
// the results: upsert on (sourceName, externalId, startsAt) so each
// occurrence keeps its own row and id across re-scrapes; cross-source
// duplicates are flagged via duplicateOfId, never merged or deleted;
// images are generated at ingestion, here, never on page render. The
// Source's lastScrapedAt/lastScrapeStatus/needsReview are updated either
// way so /dashboard and /scripts show what happened.
export async function runScraperForSource(
  sourceId: string,
  options: RunOptions = {}
): Promise<RunSummary> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  const summary: RunSummary = {
    sourceId,
    sourceName: source.name,
    ok: false,
    status: "",
    created: 0,
    updated: 0,
    duplicates: 0,
    skippedPast: 0,
    notes: [],
  };

  const fail = async (status: string) => {
    summary.status = status;
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastScrapedAt: new Date(), lastScrapeStatus: status, needsReview: true },
    });
    return summary;
  };

  const scraper = getScraper(source.sourceType);
  if (!scraper) return fail(`failed: no scraper for sourceType "${source.sourceType}"`);
  if (source.purpose !== "EVENTS") return fail("failed: not an EVENTS source");
  if (!source.regionId) return fail("failed: source has no region");

  // Read every page the scraper needs, then run the shared extraction
  // ladder over each. Both steps prefer a stored snapshot over touching
  // the origin (lib/fetcher.ts), so re-running is nearly free and a site
  // that refuses us degrades to its last known copy instead of nothing.
  const urls = [source.url, ...(scraper.extraPaths ?? []).map((p) => new URL(p, source.url).toString())];
  const pages: PageResult[] = [];
  for (const url of urls) {
    try {
      const page = await fetchPage(url, { force: options.force });
      summary.notes.push(...page.notes.map((n) => `${new URL(url).pathname}: ${n}`));
      if (page.degraded) summary.degraded = page.degraded;
      summary.fromCache = summary.fromCache || page.fromCache;
      summary.snapshotAgeMs = Math.max(summary.snapshotAgeMs ?? 0, page.ageMs);
      pages.push(page);
    } catch (err) {
      if (err instanceof FetchRefused) {
        return fail(
          err.reason === "robots"
            ? `blocked: ${err.detail} -- not scraping this source`
            : `blocked: ${err.detail}, and no stored copy to fall back on`
        );
      }
      summary.notes.push(`${url}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (pages.length === 0) return fail("failed: no page could be read");

  let result: ExtractionResult = { events: [], strategy: "none", confidence: "low", notes: [] };
  for (const page of pages) {
    const attempt = await extractEvents(page, scraper);
    result = { ...attempt, notes: [...result.notes, ...attempt.notes] };
    if (attempt.events.length) break;
  }
  summary.notes.push(...result.notes);
  summary.strategy = result.strategy;

  if (result.events.length === 0) {
    for (const page of pages) {
      for (const line of diagnosePage(page.url, page.html, {
        requestedUrl: page.requestedUrl,
        status: page.status,
        contentType: page.contentType,
      })) {
        console.log(line);
      }
      // Where the listing keeps its dates and links, when class names
      // gave nothing away. Three samples, so the repeating wrapper --
      // the thing a parser keys on -- is visible rather than guessed.
      for (const line of excerptsAroundPattern(page.html, "date", DATE_LIKE)) console.log(line);
    }
    return fail(`failed: no events found (${result.notes.join("; ")})`);
  }

  await addDetails(result.events, new Set(pages.map((p) => p.url)), summary, options.force);

  const organizer = scraper.organizerSlug
    ? await prisma.organizer.findUnique({ where: { slug: scraper.organizerSlug } })
    : null;
  if (scraper.organizerSlug && !organizer) {
    summary.notes.push(`organizer "${scraper.organizerSlug}" not found -- events will have none`);
  }

  const categories = await prisma.eventCategory.findMany();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const fallbackCategory = categoryBySlug.get(scraper.defaultCategorySlug) ?? categories[0];
  const status = result.confidence === "high" ? "PUBLISHED" : "DRAFT";
  const now = new Date();

  // A listing routinely still shows this month's earlier entries. Scraping
  // is for what's on, not for backfilling history, and one rule here beats
  // each extraction tier deciding for itself (they used to disagree).
  const notBefore = startOfTodayInMarbella().getTime();

  for (const ev of result.events) {
    if ((ev.endsAt ?? ev.startsAt).getTime() < notBefore) {
      summary.skippedPast++;
      continue;
    }
    const category = categoryBySlug.get(pickCategorySlug(ev, scraper.defaultCategorySlug)) ?? fallbackCategory;
    const key = { sourceName: scraper.sourceType, externalId: ev.externalId, startsAt: ev.startsAt };
    const data = {
      title: ev.title,
      description: ev.description,
      sourceLocale: scraper.sourceLocale,
      endsAt: ev.endsAt ?? null,
      venueName: ev.venueName ?? scraper.venueName ?? null,
      address: ev.address ?? scraper.address ?? null,
      costType: ev.costType ?? ("UNKNOWN" as const),
      costAmount: ev.costAmount ?? null,
      categoryId: category.id,
      organizerId: organizer?.id ?? null,
      sourceId: source.id,
      sourceUrl: ev.sourceUrl,
      lastSeenAt: now,
    };

    let existing = await prisma.event.findUnique({
      where: { sourceName_externalId_startsAt: key },
    });
    // An externalId is whatever identified the event last time -- a
    // detail URL once we can read one, the listing page plus a title
    // before that. When it changes, the same event is still the same
    // event: the source, the moment and the title all agree. Re-using
    // the row keeps its id, its image and its translations, where
    // creating one would leave the old copy behind on the site.
    if (!existing) {
      // Matched on the day rather than the instant: reading the detail
      // page moves an event from midnight to the hour it really starts,
      // and that must update the row, not create a second one.
      const sameDay = await prisma.event.findMany({
        where: {
          sourceId: source.id,
          startsAt: {
            gte: new Date(ev.startsAt.getTime() - 36 * 60 * 60 * 1000),
            lte: new Date(ev.startsAt.getTime() + 36 * 60 * 60 * 1000),
          },
        },
      });
      const renamed = sameDay.find(
        (e) =>
          normalizeTitle(e.title) === normalizeTitle(ev.title) &&
          marbellaDay(e.startsAt) === marbellaDay(ev.startsAt)
      );
      if (renamed) {
        existing = renamed;
        summary.notes.push(
          `"${ev.title}": kept the existing row (${renamed.externalId} -> ${ev.externalId})`
        );
      }
    }
    // A slug is deterministic, so it only differs when the rule that
    // builds it changed -- then the stored one is the stale one.
    const slug = makeSlug(ev);
    const event = existing
      ? await prisma.event.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(existing.slug === slug ? {} : { slug }),
            ...(existing.externalId === ev.externalId ? {} : { externalId: ev.externalId }),
            ...(existing.startsAt.getTime() === ev.startsAt.getTime() ? {} : { startsAt: ev.startsAt }),
          },
        })
      : await prisma.event.create({
          data: { ...data, ...key, slug, regionId: source.regionId, status },
        });
    if (existing) summary.updated++;
    else summary.created++;

    // Deterministic duplicate tier: same moment, same region, same
    // category, same title from a *different* source -> flag, keep both.
    if (!event.duplicateOfId) {
      const candidates = await prisma.event.findMany({
        where: {
          id: { not: event.id },
          regionId: source.regionId,
          categoryId: category.id,
          startsAt: ev.startsAt,
          sourceName: { not: scraper.sourceType },
          duplicateOfId: null,
        },
        orderBy: { createdAt: "asc" },
      });
      const match = candidates.find((c) => normalizeTitle(c.title) === normalizeTitle(ev.title));
      if (match) {
        await prisma.event.update({ where: { id: event.id }, data: { duplicateOfId: match.id } });
        summary.duplicates++;
      }
    }

    // The source's own poster beats anything we could generate, so it is
    // tried first; generation stays as the fallback for sources that
    // publish no picture at all.
    if (ev.imageUrls?.length) await importEventImage(event, ev.imageUrls);

    await getOrGenerateEventImageUrl({
      id: event.id,
      slug: event.slug,
      imageKey: event.imageKey,
      title: event.title,
      description: event.description,
      venueName: event.venueName,
      categoryName: category.name,
    });
  }

  const hours = Math.round((summary.snapshotAgeMs ?? 0) / 3_600_000);
  const provenance = summary.degraded
    ? `, from stored copy (${hours}h old, live fetch refused: ${summary.degraded})`
    : summary.fromCache
      ? `, from stored copy (${hours}h old)`
      : "";

  summary.ok = true;
  summary.status =
    `success: ${summary.created} new, ${summary.updated} updated` +
    (summary.skippedPast ? `, ${summary.skippedPast} already past` : "") +
    (summary.duplicates ? `, ${summary.duplicates} flagged duplicate` : "") +
    ` (${result.strategy}${result.confidence === "low" ? ", low confidence -> DRAFT" : ""})` +
    provenance;

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      lastScrapedAt: now,
      lastScrapeStatus: summary.status,
      needsReview: result.confidence === "low",
    },
  });

  return summary;
}
