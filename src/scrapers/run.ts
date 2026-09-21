import { prisma } from "../lib/prisma";
import { getOrGenerateEventImageUrl } from "../lib/imageGeneration";
import { getScraper } from "./registry";
import type { ScrapedEvent } from "./types";
import { shortHash, slugify } from "./lib/html";

export type RunSummary = {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  status: string;
  strategy?: string;
  created: number;
  updated: number;
  duplicates: number;
  notes: string[];
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
  const day = ev.startsAt.toISOString().slice(0, 10);
  return `${slugify(ev.title).slice(0, 60)}-${day}-${shortHash(ev.externalId)}`;
}

function normalizeTitle(title: string): string {
  return slugify(title).replace(/-/g, "");
}

// Runs the scraper registered for this Source's sourceType and writes
// the results: upsert on (sourceName, externalId, startsAt) so each
// occurrence keeps its own row and id across re-scrapes; cross-source
// duplicates are flagged via duplicateOfId, never merged or deleted;
// images are generated at ingestion, here, never on page render. The
// Source's lastScrapedAt/lastScrapeStatus/needsReview are updated either
// way so /dashboard and /scripts show what happened.
export async function runScraperForSource(sourceId: string): Promise<RunSummary> {
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

  let result;
  try {
    result = await scraper.run({ url: source.url });
  } catch (err) {
    return fail(`failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  summary.notes = result.notes;
  summary.strategy = result.strategy;

  if (result.events.length === 0) {
    for (const line of result.diagnostics ?? []) console.log(line);
    if (result.blockedReason) {
      // Not a parser problem: the source turned us away. Usually rate
      // limiting, so a later run at a normal interval often succeeds.
      return fail(`blocked: ${result.blockedReason} -- try again later, don't hammer`);
    }
    return fail(`failed: no events found (${result.notes.join("; ")})`);
  }

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

  for (const ev of result.events) {
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

    const existing = await prisma.event.findUnique({
      where: { sourceName_externalId_startsAt: key },
    });
    const event = existing
      ? await prisma.event.update({ where: { id: existing.id }, data })
      : await prisma.event.create({
          data: { ...data, ...key, slug: makeSlug(ev), regionId: source.regionId, status },
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

  summary.ok = true;
  summary.status =
    `success: ${summary.created} new, ${summary.updated} updated` +
    (summary.duplicates ? `, ${summary.duplicates} flagged duplicate` : "") +
    ` (${result.strategy}${result.confidence === "low" ? ", low confidence -> DRAFT" : ""})`;

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
