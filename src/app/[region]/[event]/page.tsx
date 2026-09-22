import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { defaultLocale, isLocale, ui, type Locale } from "@/lib/i18n";
import { getTranslatedField, getTranslatedFields } from "@/lib/translation";
import { formatInMarbella } from "@/lib/datetime";

export const dynamic = "force-dynamic";

// The hour is only printed when the source actually stated one; an
// event stored at midnight for want of a time would otherwise read as
// starting at 00:00. See Event.startTimeKnown.
function formatDate(date: Date, locale: Locale, timeKnown = true) {
  return formatInMarbella(date, locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(timeKnown ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  });
}

// Every field is rendered whether or not it holds anything: an empty row
// is itself information (it shows what a source didn't give us), which is
// hard to see when empty fields are simply hidden.
function DetailRow({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value: string | number | null | undefined;
  emptyLabel: string;
}) {
  const text = value === null || value === undefined || value === "" ? null : String(value);
  return (
    <div className="flex gap-2 border-b border-sea-100 py-2 text-sm last:border-0">
      <dt className="w-32 shrink-0 font-medium text-sea-900/50">{label}</dt>
      <dd className={text ? "min-w-0 break-words text-sea-900/90" : "italic text-sea-900/30"}>
        {text ?? `— ${emptyLabel}`}
      </dd>
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
    include: {
      category: true,
      organizer: true,
      region: true,
      community: true,
      source: true,
      duplicateOf: { select: { slug: true, title: true } },
      createdByUser: { select: { name: true, email: true } },
    },
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

  const costLabel =
    event.costType === "FREE"
      ? ui.costFree[locale]
      : event.costType === "PAID"
        ? event.costAmount || ui.cost[locale]
        : ui.costUnknown[locale];

  const rowProps = { emptyLabel: ui.empty[locale] };

  let sourceLanguageLabel: string | null = null;
  try {
    sourceLanguageLabel = new Intl.DisplayNames([locale], { type: "language" }).of(
      event.sourceLocale
    ) ?? null;
  } catch {
    sourceLanguageLabel = event.sourceLocale;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/${regionSlug}${sp.lang ? `?lang=${sp.lang}` : ""}`}
        className="text-sm font-medium text-sun-600 hover:underline"
      >
        &larr; {regionName}
      </Link>

      <h1 className="mt-4 text-4xl font-bold text-sea-900">{title}</h1>

      {event.imageKey && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/images/${event.imageKey}`}
          alt={title}
          className="mt-6 h-64 w-full rounded-xl object-cover sm:h-80"
        />
      )}

      <dl className="mt-6 rounded-xl border border-sea-100 bg-white px-5">
        <DetailRow
          label={ui.startDate[locale]}
          value={formatDate(event.startsAt, locale, event.startTimeKnown)}
          {...rowProps}
        />
        <DetailRow
          label={ui.startTime[locale]}
          value={
            event.startTimeKnown
              ? formatInMarbella(event.startsAt, locale, { hour: "2-digit", minute: "2-digit" })
              : null
          }
          {...rowProps}
        />
        <DetailRow
          label={ui.endDate[locale]}
          value={event.endsAt && formatDate(event.endsAt, locale)}
          {...rowProps}
        />
        <DetailRow label={ui.recurrence[locale]} value={event.recurrenceRule} {...rowProps} />
        <DetailRow label={ui.location[locale]} value={event.venueName} {...rowProps} />
        <DetailRow label={ui.address[locale]} value={event.address} {...rowProps} />
        <DetailRow
          label={ui.coordinates[locale]}
          value={
            event.latitude != null && event.longitude != null
              ? `${event.latitude}, ${event.longitude}`
              : null
          }
          {...rowProps}
        />
        <DetailRow label={ui.category[locale]} value={categoryName} {...rowProps} />
        <DetailRow label={ui.cost[locale]} value={costLabel} {...rowProps} />
        <DetailRow label={ui.community[locale]} value={event.community?.name} {...rowProps} />
        <DetailRow
          label={ui.organizer[locale]}
          value={
            event.organizer &&
            (event.organizer.website
              ? `${event.organizer.name} (${event.organizer.website})`
              : event.organizer.name)
          }
          {...rowProps}
        />
        <DetailRow label={ui.region[locale]} value={regionName} {...rowProps} />
        <DetailRow label={ui.status[locale]} value={event.status} {...rowProps} />
        <DetailRow label={ui.sourceLanguage[locale]} value={sourceLanguageLabel} {...rowProps} />
        <DetailRow label={ui.image[locale]} value={event.imageKey} {...rowProps} />
        <DetailRow label={ui.imageSource[locale]} value={event.imageUrl} {...rowProps} />
        <DetailRow label={ui.source[locale]} value={event.source?.name} {...rowProps} />
        <DetailRow label={ui.eventUrl[locale]} value={event.sourceUrl} {...rowProps} />
        <DetailRow label={ui.scraper[locale]} value={event.sourceName} {...rowProps} />
        <DetailRow label={ui.externalId[locale]} value={event.externalId} {...rowProps} />
        <DetailRow
          label={ui.lastSeen[locale]}
          value={event.lastSeenAt && formatDate(event.lastSeenAt, locale)}
          {...rowProps}
        />
        <DetailRow label={ui.duplicateOf[locale]} value={event.duplicateOf?.title} {...rowProps} />
        <DetailRow
          label={ui.createdBy[locale]}
          value={event.createdByUser?.name ?? event.createdByUser?.email}
          {...rowProps}
        />
        <DetailRow label={ui.slug[locale]} value={event.slug} {...rowProps} />
        <DetailRow label={ui.addedOn[locale]} value={formatDate(event.createdAt, locale)} {...rowProps} />
        <DetailRow label={ui.lastUpdated[locale]} value={formatDate(event.updatedAt, locale)} {...rowProps} />
      </dl>

      <div className="mt-6 rounded-xl border border-sea-100 bg-white p-6 text-sea-900/90">
        {description}
      </div>

      {event.sourceUrl && (
        <p className="mt-4 text-xs text-sea-900/40">
          {ui.moreInfo[locale]}: <a href={event.sourceUrl} className="underline">{event.sourceUrl}</a>
        </p>
      )}
    </div>
  );
}
