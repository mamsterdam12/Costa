import { prisma } from "../lib/prisma";
import { scrapers } from "./registry";
import { runScraperForSource } from "./run";
import { formatStamp } from "../lib/datetime";

// Command-line entry point for the regular (cron-style) scrape:
//   npm run scrape            -> every active EVENTS source with a scraper
//   npm run scrape -- the-farm -> only sources with that sourceType
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.find((a) => !a.startsWith("--"));
  const sourceTypes = only ? [only] : scrapers.map((s) => s.sourceType);

  const sources = await prisma.source.findMany({
    where: { active: true, purpose: "EVENTS", sourceType: { in: sourceTypes } },
    orderBy: { name: "asc" },
  });
  if (sources.length === 0) {
    console.log(`No active EVENTS sources with sourceType in [${sourceTypes.join(", ")}].`);
    return;
  }

  for (const source of sources) {
    const summary = await runScraperForSource(source.id, { force });
    console.log(`[scrape] ${summary.sourceName}: ${summary.status}`);
    for (const note of summary.notes) console.log(`         - ${note}`);
  }

  await reportStoredEvents();
}

// What the run actually left in the database, as the site will show it.
// The per-source summaries say what was read; this says what was kept,
// which is the thing worth checking after a change to the parsers.
async function reportStoredEvents() {
  // Exactly what a visitor would see: published, not a flagged
  // duplicate, still to come. An archived row counted here would make
  // the report disagree with the site.
  const visible = {
    startsAt: { gte: new Date() },
    status: "PUBLISHED" as const,
    duplicateOfId: null,
  };
  const events = await prisma.event.findMany({
    where: visible,
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  const total = await prisma.event.count({ where: visible });
  const missing = {
    time: await prisma.event.count({ where: { ...visible, startTimeKnown: false } }),
    venue: await prisma.event.count({ where: { ...visible, venueName: null } }),
    address: await prisma.event.count({ where: { ...visible, address: null } }),
    cost: await prisma.event.count({ where: { ...visible, costType: "UNKNOWN" } }),
    image: await prisma.event.count({ where: { ...visible, imageKey: null } }),
    url: await prisma.event.count({ where: { ...visible, sourceUrl: null } }),
  };

  console.log(`[stored] ${total} upcoming event(s) a visitor can see`);
  console.log(
    `[stored] without: ${missing.time} a time, ${missing.venue} a venue, ${missing.address} an address, ` +
      `${missing.cost} a price, ${missing.image} a picture, ${missing.url} their own URL`
  );
  for (const e of events) {
    console.log(
      `[stored] ${formatStamp(e.startsAt, "nl-NL")}${e.startTimeKnown ? "" : " (date only)"} | ${e.title}` +
        ` | ${e.venueName ?? "no venue"} | ${e.address ?? "no address"} | ${e.costType}` +
        `${e.costAmount ? ` ${e.costAmount}` : ""} | ${e.imageKey ?? "no image"} | ${e.sourceUrl ?? "no url"}`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
