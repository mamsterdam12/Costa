import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { getTranslatedField, getTranslatedFields } from "@/lib/translation";

export const dynamic = "force-dynamic";

function formatDateRange(start: Date, end: Date | null, locale: Locale) {
  const fmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!end) return fmt.format(start);
  return `${fmt.format(start)} — ${fmt.format(end)}`;
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ region: string; event: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { region: regionSlug, event: eventSlug } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(sp.lang) ? sp.lang : defaultLocale;

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    include: { category: true, organizer: true, region: true },
  });

  if (!event || event.region.slug !== regionSlug) notFound();

  const [{ title, description }, regionName, categoryName] = await Promise.all([
    getTranslatedFields("event", event.id, event.sourceLocale as Locale, locale, {
      title: event.title,
      description: event.description,
    }),
    getTranslatedField({
      entityType: "region",
      entityId: event.region.id,
      field: "name",
      sourceText: event.region.name,
      sourceLocale: event.region.sourceLocale as Locale,
      targetLocale: locale,
    }),
    getTranslatedField({
      entityType: "eventCategory",
      entityId: event.category.id,
      field: "name",
      sourceText: event.category.name,
      sourceLocale: event.category.sourceLocale as Locale,
      targetLocale: locale,
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/${regionSlug}${sp.lang ? `?lang=${sp.lang}` : ""}`} className="text-sm font-medium text-sun-600 hover:underline">
        &larr; {regionName}
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-sea-900">{title}</h1>
      <p className="mt-2 text-sm text-sea-900/60">
        {formatDateRange(event.startsAt, event.endsAt, locale)}
        {event.venueName ? ` · ${event.venueName}` : ""}
      </p>
      <p className="mt-1 text-xs text-sea-900/50">
        {categoryName}
        {event.organizer ? ` · ${event.organizer.name}` : ""}
        {event.recurrenceRule ? ` · ${event.recurrenceRule}` : ""}
      </p>

      <div className="mt-6 rounded-xl border border-sea-100 bg-white p-6 text-sea-900/90">
        {description}
      </div>

      {event.sourceUrl && (
        <p className="mt-4 text-xs text-sea-900/40">
          Bron: <a href={event.sourceUrl} className="underline">{event.sourceUrl}</a>
        </p>
      )}
    </div>
  );
}
