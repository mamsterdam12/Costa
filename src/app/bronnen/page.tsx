import { prisma } from "@/lib/prisma";
import { defaultLocale, isLocale, ui, type Locale } from "@/lib/i18n";
import { formatStamp } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type SourceRow = Awaited<ReturnType<typeof loadSources>>[number];

function loadSources() {
  return prisma.source.findMany({
    include: { region: true, _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });
}

function SourceTable({ sources, locale }: { sources: SourceRow[]; locale: Locale }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-sea-100 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-sea-100 text-xs uppercase text-sea-900/50">
          <tr>
            <th className="px-4 py-2">{ui.name[locale]}</th>
            <th className="px-4 py-2">{ui.region[locale]}</th>
            <th className="px-4 py-2">{ui.type[locale]}</th>
            <th className="px-4 py-2">{ui.foundBy[locale]}</th>
            <th className="px-4 py-2 text-right">{ui.events[locale]}</th>
            <th className="px-4 py-2">{ui.lastScraped[locale]}</th>
            <th className="px-4 py-2">{ui.status[locale]}</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id} className="border-b border-sea-50 last:border-0">
              <td className="px-4 py-2 font-medium text-sea-900">
                <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {s.name}
                </a>
              </td>
              <td className="px-4 py-2 text-sea-900/70">{s.region?.name ?? "—"}</td>
              <td className="px-4 py-2 text-sea-900/70">{s.sourceType}</td>
              <td className="px-4 py-2 text-sea-900/70">{s.discoveredBy}</td>
              <td className="px-4 py-2 text-right text-sea-900/70">{s._count.events}</td>
              <td className="px-4 py-2 text-sea-900/70">
                {s.lastScrapedAt ? formatStamp(s.lastScrapedAt, locale) : ui.never[locale]}
              </td>
              <td className="px-4 py-2 text-sea-900/70">
                {s.active ? ui.active[locale] : ui.inactive[locale]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const locale: Locale = isLocale(sp.lang) ? sp.lang : defaultLocale;

  const sources = await loadSources();
  const eventSources = sources.filter((s) => s.purpose === "EVENTS");
  const discoverySources = sources.filter((s) => s.purpose === "SOURCE_DISCOVERY");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-sea-900">{ui.sources[locale]}</h1>
      <p className="mt-1 text-sm text-sea-900/70">{ui.sourcesIntro[locale]}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-sea-900">
          {ui.purposeEvents[locale]} ({eventSources.length})
        </h2>
        <div className="mt-3">
          <SourceTable sources={eventSources} locale={locale} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-sea-900">
          {ui.purposeDiscovery[locale]} ({discoverySources.length})
        </h2>
        <div className="mt-3">
          <SourceTable sources={discoverySources} locale={locale} />
        </div>
      </section>
    </div>
  );
}
