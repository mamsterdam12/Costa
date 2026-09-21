import { prisma } from "@/lib/prisma";
import { defaultLocale, isLocale, ui, type Locale } from "@/lib/i18n";
import { scrapers } from "@/scrapers/registry";
import { formatStamp } from "@/lib/datetime";
import { runScraper } from "./actions";

export const dynamic = "force-dynamic";

// Lists every scrape script in src/scrapers/registry.ts with the Sources
// it applies to (matched on sourceType) and a button to run it now.
// Like /dashboard this has no auth yet -- the run button is only as
// private as the URL. Add access control before linking this publicly.
export default async function ScriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const locale: Locale = isLocale(sp.lang) ? sp.lang : defaultLocale;

  const sources = await prisma.source.findMany({
    where: { sourceType: { in: scrapers.map((s) => s.sourceType) } },
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-sea-900">{ui.scripts[locale]}</h1>
      <p className="mt-1 text-sm text-sea-900/70">{ui.scriptsIntro[locale]}</p>

      <div className="mt-8 space-y-6">
        {scrapers.map((scraper) => {
          const matching = sources.filter((s) => s.sourceType === scraper.sourceType);
          return (
            <section key={scraper.sourceType} className="rounded-xl border border-sea-100 bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-sea-900">{scraper.name}</h2>
                <code className="text-xs text-sea-900/50">sourceType: {scraper.sourceType}</code>
              </div>
              <p className="mt-1 text-sm text-sea-900/70">{scraper.description}</p>

              {matching.length === 0 ? (
                <p className="mt-4 text-sm text-sea-900/50">{ui.noSourcesForScript[locale]}</p>
              ) : (
                <ul className="mt-4 divide-y divide-sea-50">
                  {matching.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-sea-900 hover:underline">
                          {s.name}
                        </a>
                        <div className="mt-0.5 text-xs text-sea-900/60">
                          {ui.events[locale]}: {s._count.events} · {ui.lastRun[locale]}:{" "}
                          {s.lastScrapedAt ? formatStamp(s.lastScrapedAt, locale) : ui.never[locale]}
                          {s.lastScrapeStatus && (
                            <>
                              {" "}
                              ·{" "}
                              <span className={s.lastScrapeStatus.startsWith("failed") ? "text-red-600" : ""}>
                                {s.lastScrapeStatus}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <form action={runScraper.bind(null, s.id)}>
                        <button
                          type="submit"
                          className="rounded-full bg-sea-600 px-4 py-1.5 text-sm font-medium text-white"
                        >
                          {ui.run[locale]}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
