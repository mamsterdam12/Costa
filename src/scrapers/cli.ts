import { prisma } from "../lib/prisma";
import { scrapers } from "./registry";
import { runScraperForSource } from "./run";

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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
