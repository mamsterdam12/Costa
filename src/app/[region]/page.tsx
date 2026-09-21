import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { defaultLocale, isLocale, locales, translate, type Locale } from "@/lib/i18n";
import { dateFilterRange, dateFilterLabels, type DateFilter } from "@/lib/eventFilters";

export const dynamic = "force-dynamic";

const dateFilters: DateFilter[] = ["today", "tomorrow", "weekend", "week", "month"];

function formatDate(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function RegionPage({
  params,
  searchParams,
}: {
  params: Promise<{ region: string }>;
  searchParams: Promise<{ lang?: string; when?: string; category?: string }>;
}) {
  const { region: regionSlug } = await params;
  const sp = await searchParams;

  const locale: Locale = isLocale(sp.lang) ? sp.lang : defaultLocale;
  const activeFilter: DateFilter | undefined = dateFilters.includes(sp.when as DateFilter)
    ? (sp.when as DateFilter)
    : undefined;

  const region = await prisma.region.findUnique({ where: { slug: regionSlug } });
  if (!region) notFound();

  const categories = await prisma.eventCategory.findMany({ orderBy: { slug: "asc" } });

  const [from, to] = activeFilter ? dateFilterRange(activeFilter) : [undefined, undefined];

  const events = await prisma.event.findMany({
    where: {
      regionId: region.id,
      status: "PUBLISHED",
      ...(from && to ? { startsAt: { gte: from, lt: to } } : {}),
      ...(sp.category ? { category: { slug: sp.category } } : {}),
    },
    include: { category: true, organizer: true },
    orderBy: { startsAt: "asc" },
  });

  const buildHref = (overrides: Partial<{ when: string; category: string; lang: string }>) => {
    const next = new URLSearchParams();
    const when = "when" in overrides ? overrides.when : sp.when;
    const category = "category" in overrides ? overrides.category : sp.category;
    const lang = "lang" in overrides ? overrides.lang : sp.lang;
    if (when) next.set("when", when);
    if (category) next.set("category", category);
    if (lang) next.set("lang", lang);
    const qs = next.toString();
    return `/${regionSlug}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-sun-600">What&apos;s on</p>
          <h1 className="text-3xl font-bold text-sea-900">{translate(region.name, locale)}</h1>
        </div>
        <div className="flex gap-2">
          {locales.map((l) => (
            <Link
              key={l}
              href={buildHref({ lang: l })}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                l === locale ? "bg-sea-600 text-white" : "bg-white text-sea-600 border border-sea-100"
              }`}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={buildHref({ when: undefined })}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            !activeFilter ? "bg-sea-600 text-white" : "bg-white text-sea-900 border border-sea-100"
          }`}
        >
          {locale === "en" ? "All" : locale === "es" ? "Todo" : "Alles"}
        </Link>
        {dateFilters.map((f) => (
          <Link
            key={f}
            href={buildHref({ when: f })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              activeFilter === f ? "bg-sea-600 text-white" : "bg-white text-sea-900 border border-sea-100"
            }`}
          >
            {dateFilterLabels[f][locale]}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={buildHref({ category: undefined })}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !sp.category ? "bg-sun-500 text-sea-900" : "bg-white text-sea-600 border border-sea-100"
          }`}
        >
          {locale === "en" ? "All categories" : locale === "es" ? "Todas las categorías" : "Alle categorieën"}
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={buildHref({ category: c.slug })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sp.category === c.slug ? "bg-sun-500 text-sea-900" : "bg-white text-sea-600 border border-sea-100"
            }`}
          >
            {translate(c.name, locale)}
          </Link>
        ))}
      </div>

      <ul className="mt-8 space-y-4">
        {events.length === 0 && (
          <li className="rounded-xl border border-dashed border-sea-100 p-6 text-center text-sea-900/60">
            {locale === "en"
              ? "No events found for this filter."
              : locale === "es"
                ? "No se han encontrado eventos para este filtro."
                : "Geen events gevonden voor dit filter."}
          </li>
        )}
        {events.map((event) => (
          <li key={event.id} className="rounded-xl border border-sea-100 bg-white p-5">
            <Link
              href={`/${regionSlug}/${event.slug}${sp.lang ? `?lang=${sp.lang}` : ""}`}
              className="text-lg font-semibold text-sea-600 hover:underline"
            >
              {translate(event.title, locale)}
            </Link>
            <p className="mt-1 text-sm text-sea-900/70">{translate(event.description, locale)}</p>
            <p className="mt-2 text-xs text-sea-900/50">
              {formatDate(event.startsAt, locale)}
              {event.venueName ? ` · ${event.venueName}` : ""} · {translate(event.category.name, locale)}
              {event.organizer ? ` · ${event.organizer.name}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
