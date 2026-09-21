import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { defaultLocale, isLocale, ui, type Locale } from "@/lib/i18n";
import { getTranslatedField, getTranslatedFields } from "@/lib/translation";

export const dynamic = "force-dynamic";

function formatDate(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 border-b border-sea-100 py-2 text-sm last:border-0">
      <dt className="w-28 shrink-0 font-medium text-sea-900/50">{label}</dt>
      <dd className="text-sea-900/90">{value}</dd>
    </div>
  );
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
      <Link
        href={`/${regionSlug}${sp.lang ? `?lang=${sp.lang}` : ""}`}
        className="text-sm font-medium text-sun-600 hover:underline"
      >
        &larr; {regionName}
      </Link>

      <h1 className="mt-4 text-4xl font-bold text-sea-900">{title}</h1>

      <dl className="mt-6 rounded-xl border border-sea-100 bg-white px-5">
        <DetailRow label={ui.startDate[locale]} value={formatDate(event.startsAt, locale)} />
        {event.endsAt && (
          <DetailRow label={ui.endDate[locale]} value={formatDate(event.endsAt, locale)} />
        )}
        {event.venueName && <DetailRow label={ui.location[locale]} value={event.venueName} />}
        <DetailRow label={ui.category[locale]} value={categoryName} />
      </dl>

      <div className="mt-6 rounded-xl border border-sea-100 bg-white p-6 text-sea-900/90">
        {description}
      </div>

      {event.sourceUrl && (
        <p className="mt-4 text-xs text-sea-900/40">
          {ui.source[locale]}: <a href={event.sourceUrl} className="underline">{event.sourceUrl}</a>
        </p>
      )}
    </div>
  );
}
