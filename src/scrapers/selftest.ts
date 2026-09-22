import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDateRange } from "./lib/dates";
import { parseUikitListing } from "./lib/uikitListing";
import { findFeedUrls, parseFeed } from "./lib/feed";
import { extractEvents } from "./lib/extract";
import { parseJetCalendar } from "./lib/jetCalendar";
import { classifyCost, extractDetails } from "./lib/detail";
import { atTimeInMarbella } from "./lib/dates";
import type { PageResult } from "./lib/fetcher";
import { turismoMarbellaScraper } from "./turismoMarbella";
import { MARBELLA_TZ, marbellaDay } from "../lib/datetime";

// Parser tests that need no network and no database, so a change to the
// extraction ladder can be checked here in seconds instead of by pushing
// and reading the deploy log. Fixtures are real markup, captured from the
// diagnostics of an actual run.
//
//   npm run test:scrapers

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

// Day as it reads in Marbella, so a test failure names a date rather
// than an instant.
const DAY = new Intl.DateTimeFormat("nl-NL", {
  timeZone: MARBELLA_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
function day(d?: Date | null): string | null {
  return d ? DAY.format(d).replace(/-/g, "-") : null;
}

async function main() {
  console.log("dates:");
  const cases: Array<[string, string | null, string | null]> = [
    ["28 Mayo 2026 - 15 Noviembre 2026", "28-05-2026", "15-11-2026"],
    ["1 Junio 2026", "01-06-2026", null],
    ["18 Junio 2026 - 30 Septiembre 2026", "18-06-2026", "30-09-2026"],
    ["26 Sep 2026", "26-09-2026", null],
    ["1 Oct 2026 - 4 Oct 2026", "01-10-2026", "04-10-2026"],
    ["3 Oct 2026 - 12 Dic 2026", "03-10-2026", "12-12-2026"],
    // The year appears only on the second half of the range.
    ["28 Mayo - 15 Noviembre 2026", "28-05-2026", "15-11-2026"],
    // The city site really does publish this one backwards; keep the start.
    ["3 Septiembre 2026 - 28 Agosto 2026", "03-09-2026", null],
    ["13 okt 2026 20:00", "13-10-2026", null],
    ["2026-10-13", "13-10-2026", null],
    ["Exposiciones", null, null],
  ];
  for (const [raw, start, end] of cases) {
    const r = parseDateRange(raw);
    check(`"${raw}"`, [day(r?.start), day(r?.end)], [start, end]);
  }
  // Wall-clock times must land on the right instant in Spanish time
  // (CEST in October, so 20:00 local is 18:00 UTC).
  check(
    "time of day is Marbella local",
    parseDateRange("13 okt 2026 20:00")?.start.toISOString(),
    "2026-10-13T18:00:00.000Z"
  );

  // An event that starts at midnight local is still that day, not the
  // UTC day before -- which is what its slug is built from.
  check("calendar day is the Marbella one", marbellaDay(parseDateRange("28 Mayo 2026")!.start), "2026-05-28");
  check("calendar day in winter time", marbellaDay(parseDateRange("15 enero 2026")!.start), "2026-01-15");

  console.log("yootheme listing (turismo.marbella.es):");
  const html = readFileSync(join(__dirname, "lib/fixtures/turismo-agenda.html"), "utf8");
  const listing = parseUikitListing(html, "https://turismo.marbella.es/agenda.html");
  const titles = listing.events.map((e) => e.title);
  check("finds every entry", listing.events.length, 9);
  check("sidebar teaser", titles.includes("Dalí - Diez recetas de inmortalidad"), true);
  check("listing entry", titles.includes("DAR GHOST"), true);
  check("no duplicate of Salvador Calvo", titles.filter((t) => t === "Salvador Calvo").length, 1);

  const dar = listing.events.find((e) => e.title === "DAR GHOST")!;
  check("entry keeps its own URL", dar.sourceUrl, "https://turismo.marbella.es/agenda/dar-ghost.html");
  check("entry keeps its description", dar.description.startsWith("Dar Ghost es un"), true);
  check("entry date", [day(dar.startsAt), day(dar.endsAt)], ["26-09-2026", null]);

  const dali = listing.events.find((e) => e.title.startsWith("Dalí"))!;
  check("teaser date range", [day(dali.startsAt), day(dali.endsAt)], ["28-05-2026", "15-11-2026"]);
  check("teaser without a link falls back to the page", dali.sourceUrl, "https://turismo.marbella.es/agenda.html");
  check("unlinked entries are counted", listing.unlinked, 3);
  check("no entry linked to a wrong page", listing.events.every((e) => !/\/agenda\.html$/.test(e.sourceUrl) || e.externalId.includes("#")), true);

  console.log("extraction ladder:");
  const page: PageResult = {
    requestedUrl: "https://turismo.marbella.es/agenda.html",
    url: "https://turismo.marbella.es/agenda.html",
    html,
    status: 200,
    contentType: "text/html; charset=utf-8",
    fromCache: true,
    fetchedAt: new Date(),
    ageMs: 0,
    notes: [],
  };
  // Runs the real ladder. The listing tier has to win here without any
  // network call: the fixture advertises a feed, and reaching for it would
  // mean a request per run for dates the page already states.
  const ladder = await extractEvents(page, turismoMarbellaScraper);
  check("picks the listing tier", ladder.strategy, "yootheme-listing");
  check("high confidence -> published", ladder.confidence, "high");
  check("every event carries a date", ladder.events.every((e) => !isNaN(e.startsAt.getTime())), true);
  check("no event points at a listing page", ladder.events.filter((e) => e.sourceUrl.endsWith("/agenda.html")).length, 3);

  console.log("jet calendar (The Farm):");
  const jet = parseJetCalendar(
    readFileSync(join(__dirname, "lib/fixtures/jet-calendar.html"), "utf8"),
    "https://thefarm-marbella.com/whats-on/"
  );
  check("month and year read, not guessed", [jet.label, jet.datesExplicit], ["2026-10", true]);
  check("one row per event, overlay copy dropped", jet.events.length, 2);
  // JetEngine hides the URL in the overlay's data-url, entity-encoded.
  check(
    "entry keeps its own URL, whole and decoded",
    jet.events[0]?.sourceUrl,
    "https://thefarm-marbella.com/whats-on/flamenco-night/?date=2026-10-13&unix=1791000000"
  );
  check("evening time in Marbella", jet.events[0]?.startsAt.toISOString(), "2026-10-13T18:30:00.000Z");
  check("cell from the neighbouring month ignored", jet.events.some((e) => e.title === "Last Month Party"), false);
  check("entry without a link falls back to the page", jet.events[1]?.sourceUrl, "https://thefarm-marbella.com/whats-on/");
  check("never borrows the next entry's URL", jet.events[1]?.externalId.includes("#"), true);

  console.log("detail page:");
  const detailPage: PageResult = {
    requestedUrl: "https://turismo.marbella.es/agenda/carnaval-moraga.html",
    url: "https://turismo.marbella.es/agenda/carnaval-moraga.html",
    html: readFileSync(join(__dirname, "lib/fixtures/detail-page.html"), "utf8"),
    status: 200,
    contentType: "text/html; charset=utf-8",
    fromCache: true,
    fetchedAt: new Date(),
    ageMs: 0,
    notes: [],
  };
  const details = extractDetails(detailPage, "Carnaval Moraga");
  check("reads the starting time", details.time, { hour: 20, minute: 0 });
  check("reads the place", details.venueName, "Boulevard Pablo Ráez");
  check("reads free admission", [details.costType, details.costAmount], ["FREE", undefined]);
  check("reads the summary", details.description?.startsWith("XXI Moraga Carnavalesca"), true);
  check(
    "takes the poster, not the site logo",
    details.imageUrl,
    "https://turismo.marbella.es/images/agenda/2026/moraga-carnavalesca-2026.jpg"
  );
  // A listing date is midnight; the detail page is what makes it 20:00.
  check(
    "midnight plus the detail time is the real start",
    atTimeInMarbella(parseDateRange("26 Septiembre 2026")!.start, details.time!).toISOString(),
    "2026-09-26T18:00:00.000Z"
  );
  check("a price in euros is not free", classifyCost("12 € por persona").costType, "PAID");
  check("no price stated stays unknown", classifyCost("Aforo limitado").costType, "UNKNOWN");

  console.log("feed:");
  check("finds the advertised feed", findFeedUrls(html, "https://turismo.marbella.es/agenda.html"), [
    "https://turismo.marbella.es/agenda.feed?type=rss",
  ]);
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>DAR GHOST - 26 Sep 2026</title><link>https://turismo.marbella.es/agenda/dar-ghost.html</link>
      <description><![CDATA[Espectáculo escénico multidisciplinar.]]></description>
      <pubDate>Mon, 01 Sep 2026 10:00:00 +0200</pubDate></item>
    <item><title>Noticias del ayuntamiento</title><link>https://turismo.marbella.es/noticias.html</link>
      <description>Sin fecha de evento.</description><pubDate>Tue, 02 Sep 2026 10:00:00 +0200</pubDate></item>
  </channel></rss>`;
  const feed = parseFeed(rss, "https://turismo.marbella.es/agenda.feed?type=rss");
  check("dated item becomes an event", feed.events.length, 1);
  check("item keeps its own URL", feed.events[0]?.sourceUrl, "https://turismo.marbella.es/agenda/dar-ghost.html");
  check("event date, not the publication date", day(feed.events[0]?.startsAt), "26-09-2026");
  check("undated item skipped, not dated by pubDate", feed.undated, 1);

  console.log(failures ? `\n${failures} failing check(s)` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main();
