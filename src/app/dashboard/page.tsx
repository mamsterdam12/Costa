import { prisma } from "@/lib/prisma";
import { isTranslationEnabled } from "@/lib/settings";
import { formatStamp } from "@/lib/datetime";
import { toggleTranslation, toggleSourceActive, clearSourceReview } from "./actions";

export const dynamic = "force-dynamic";

// Internal ops view: no auth yet (there's no login system at all in the
// platform yet -- see src/lib -- so this is only as private as the URL).
// Add access control here before this is linked from anywhere public.
export default async function DashboardPage() {
  const [sources, translationEnabled] = await Promise.all([
    prisma.source.findMany({
      include: { region: true, _count: { select: { events: true } } },
      orderBy: [{ needsReview: "desc" }, { name: "asc" }],
    }),
    isTranslationEnabled(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-sea-900">Dashboard</h1>

      <section className="mt-8 rounded-xl border border-sea-100 bg-white p-5">
        <h2 className="text-lg font-semibold text-sea-900">Vertalen (OpenAI)</h2>
        <p className="mt-1 text-sm text-sea-900/70">
          Status: <strong>{translationEnabled ? "aan" : "uit"}</strong>. Handmatige schakelaar,
          geen automatisch herstel -- zet 'm zelf weer aan zodra er credits/een werkend model is.
        </p>
        <form action={toggleTranslation} className="mt-3">
          <button
            type="submit"
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              translationEnabled ? "bg-sea-600 text-white" : "bg-sun-500 text-sea-900"
            }`}
          >
            {translationEnabled ? "Zet uit" : "Zet aan"}
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-sea-900">Scrape-bronnen ({sources.length})</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-sea-100 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sea-100 text-xs uppercase text-sea-900/50">
              <tr>
                <th className="px-4 py-2">Naam</th>
                <th className="px-4 py-2">Regio</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Doel</th>
                <th className="px-4 py-2">Events</th>
                <th className="px-4 py-2">Laatst gescraped</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actief</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sea-900/50">
                    Nog geen bronnen geregistreerd.
                  </td>
                </tr>
              )}
              {sources.map((s) => (
                <tr key={s.id} className={`border-b border-sea-50 ${s.needsReview ? "bg-sun-50" : ""}`}>
                  <td className="px-4 py-2 font-medium text-sea-900">
                    <a href={s.url} className="hover:underline" target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-sea-900/70">{s.region?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-sea-900/70">{s.sourceType}</td>
                  <td className="px-4 py-2 text-sea-900/70">{s.purpose}</td>
                  <td className="px-4 py-2 text-sea-900/70">{s._count.events}</td>
                  <td className="px-4 py-2 text-sea-900/70">
                    {s.lastScrapedAt ? formatStamp(s.lastScrapedAt, "nl") : "nooit"}
                  </td>
                  <td className="px-4 py-2 text-sea-900/70">
                    {s.needsReview ? (
                      <span className="font-medium text-sun-600">nader te bekijken</span>
                    ) : (
                      (s.lastScrapeStatus ?? "—")
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <form action={toggleSourceActive.bind(null, s.id, !s.active)}>
                      <button
                        type="submit"
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          s.active ? "bg-sea-600 text-white" : "bg-white text-sea-600 border border-sea-100"
                        }`}
                      >
                        {s.active ? "actief" : "inactief"}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    {s.needsReview && (
                      <form action={clearSourceReview.bind(null, s.id)}>
                        <button type="submit" className="text-xs text-sea-600 underline">
                          markeer bekeken
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
