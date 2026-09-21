import { PrismaClient } from "@prisma/client";
import { getOrGenerateEventImageUrl } from "../src/lib/imageGeneration";

const prisma = new PrismaClient();

// Pre-seeds the shared Translation cache with curated copy (marked HUMAN
// so the lazy machine-translation path never overwrites it). Any locale
// that isn't hand-written here (Swedish, German, Danish, ...) simply isn't
// cached yet, and gets machine-translated + cached the first time someone
// requests it.
async function seedTranslation(
  entityType: string,
  entityId: string,
  field: string,
  locale: string,
  text: string
) {
  await prisma.translation.upsert({
    where: { entityType_entityId_field_locale: { entityType, entityId, field, locale } },
    update: { text, source: "HUMAN" },
    create: { entityType, entityId, field, locale, text, source: "HUMAN" },
  });
}

async function main() {
  // Clear any cached machine translations before reseeding the source
  // content below -- if a bad/stale source value was ever machine-
  // translated and cached, fixing the source alone wouldn't fix what's
  // already cached. HUMAN entries (curated EN/ES copy) are left alone.
  await prisma.translation.deleteMany({ where: { source: "MACHINE" } });

  const spain = await prisma.region.upsert({
    where: { slug: "spanje" },
    update: { name: "Spanje", sourceLocale: "nl", country: "ES" },
    create: { slug: "spanje", name: "Spanje", sourceLocale: "nl", country: "ES" },
  });
  await seedTranslation("region", spain.id, "name", "en", "Spain");
  await seedTranslation("region", spain.id, "name", "es", "España");

  const costaDelSolData = {
    name: "Costa del Sol",
    sourceLocale: "nl",
    country: "ES",
    parentId: spain.id,
  };
  const costaDelSol = await prisma.region.upsert({
    where: { slug: "costa-del-sol" },
    update: costaDelSolData,
    create: { slug: "costa-del-sol", ...costaDelSolData },
  });

  const marbellaData = {
    name: "Marbella",
    sourceLocale: "nl",
    country: "ES",
    parentId: costaDelSol.id,
    latitude: 36.5108,
    longitude: -4.8856,
  };
  const marbella = await prisma.region.upsert({
    where: { slug: "marbella" },
    update: marbellaData,
    create: { slug: "marbella", ...marbellaData },
  });

  // Source registry: the real sites this seed's events were researched
  // from, registered as sources a future regular-scraping script can read
  // and re-visit. discoveredBy defaults to MANUAL below; entries found via
  // an AI-assisted discovery pass over a SOURCE_DISCOVERY source set it to
  // "AI" explicitly (active: true here since a human reviewed and
  // approved them in the same pass that added their first event -- a
  // fully automated discovery run would instead leave active: false
  // pending review).
  //
  // Each `url` here is the organizer's own EVENTS overview page (what a
  // regular scraper script would crawl) -- distinct from an individual
  // Event's own `sourceUrl`, which is that one event's specific detail
  // page. purpose: SOURCE_DISCOVERY marks aggregators (like My Guide
  // Marbella, a travel-guide directory covering many unrelated venues,
  // the same role Eventbrite would play) that periodic AI discovery runs
  // use to *find* new EVENTS sources -- never scraped for events directly,
  // so no Event ever links to one via sourceKey below.
  const sourceDefs: Array<{
    key: string;
    name: string;
    url: string;
    sourceType: string;
    purpose: "EVENTS" | "SOURCE_DISCOVERY";
    discoveredBy?: "MANUAL" | "AI";
    notes?: string;
  }> = [
    {
      key: "ayuntamiento-marbella",
      name: "Ayuntamiento de Marbella (Turismo agenda)",
      url: "https://turismo.marbella.es/agenda.html",
      sourceType: "html-listing",
      purpose: "EVENTS",
    },
    {
      key: "manolo-santana",
      name: "Manolo Santana Racquets Club",
      url: "https://manolosantana.es/en/mixin-paddle-tennis-matches/",
      sourceType: "html-listing",
      purpose: "EVENTS",
    },
    {
      key: "tablao-ana-maria",
      name: "Tablao Flamenco Ana Maria",
      url: "https://www.flamencoanamariamarbella.com/",
      sourceType: "html-listing",
      purpose: "EVENTS",
    },
    {
      key: "the-farm",
      name: "The Farm Marbella",
      url: "https://thefarm-marbella.com/whats-on/",
      sourceType: "html-listing",
      purpose: "EVENTS",
    },
    {
      key: "marbella4dayswalking",
      name: "Marbella 4Days Walking",
      url: "https://marbella4dayswalking.com/",
      sourceType: "html-listing",
      purpose: "EVENTS",
    },
    {
      key: "myguide-marbella",
      name: "My Guide Marbella",
      url: "https://www.myguidemarbella.com/",
      sourceType: "html-listing",
      purpose: "SOURCE_DISCOVERY",
      notes: "Travel-guide directory covering many unrelated venues (like Eventbrite) -- a source for finding sources, not for scraping events directly.",
    },
    // Found via a discovery pass over the SOURCE_DISCOVERY source above
    // (My Guide Marbella's nightlife/events listings) -- the two venues
    // below turned up there and were then verified and registered here
    // as their own direct EVENTS sources.
    {
      key: "premiere-club",
      name: "Premiere Club Marbella",
      url: "https://www.facebook.com/PremiereClubMarbella/",
      sourceType: "facebook-page",
      purpose: "EVENTS",
      discoveredBy: "AI",
      notes: "No dedicated events website; Facebook is their primary public events channel.",
    },
    {
      key: "nikki-beach",
      name: "Nikki Beach Marbella",
      url: "https://nikkibeach.com/marbella/happenings/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
    },
  ];
  const sourceByKey: Record<string, Awaited<ReturnType<typeof prisma.source.upsert>>> = {};
  for (const { key, ...s } of sourceDefs) {
    sourceByKey[key] = await prisma.source.upsert({
      where: { url: s.url },
      update: { name: s.name, sourceType: s.sourceType, purpose: s.purpose, regionId: marbella.id },
      create: { ...s, regionId: marbella.id, discoveredBy: s.discoveredBy ?? "MANUAL", active: true },
    });
  }

  const categoryDefs = [
    {
      slug: "sport-fitness",
      name: "Sport & fitness",
      en: "Sport & fitness",
      es: "Deporte y fitness",
    },
    {
      slug: "eten-drinken",
      name: "Eten & drinken",
      en: "Food & drink",
      es: "Comida y bebida",
    },
    {
      slug: "muziek-uitgaan",
      name: "Muziek & uitgaan",
      en: "Music & nightlife",
      es: "Música y ocio nocturno",
    },
    {
      slug: "markten-shopping",
      name: "Markten & shopping",
      en: "Markets & shopping",
      es: "Mercados y compras",
    },
    {
      slug: "cultuur",
      name: "Cultuur",
      en: "Culture",
      es: "Cultura",
    },
  ];

  const categoryBySlug: Record<string, Awaited<ReturnType<typeof prisma.eventCategory.upsert>>> = {};
  for (const c of categoryDefs) {
    const category = await prisma.eventCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sourceLocale: "nl" },
      create: { slug: c.slug, name: c.name, sourceLocale: "nl" },
    });
    categoryBySlug[c.slug] = category;
    await seedTranslation("eventCategory", category.id, "name", "en", c.en);
    await seedTranslation("eventCategory", category.id, "name", "es", c.es);
  }

  // Example residential community, distinct from Region -- Manolo Santana
  // Racquets Club sits in Nueva Andalucía, so its events can optionally be
  // scoped to that community rather than only to Marbella as a whole.
  const nuevaAndalucia = await prisma.community.upsert({
    where: { id: "seed-nueva-andalucia" },
    update: { name: "Nueva Andalucía", regionId: marbella.id },
    create: { id: "seed-nueva-andalucia", name: "Nueva Andalucía", regionId: marbella.id },
  });

  const organizers = await Promise.all(
    [
      { slug: "ayuntamiento-marbella", name: "Ayuntamiento de Marbella", website: "https://www.marbella.es" },
      { slug: "manolo-santana-club", name: "Manolo Santana Racquets Club", website: "https://manolosantana.es" },
      { slug: "tablao-ana-maria", name: "Tablao Flamenco Ana Maria", website: "https://www.flamencoanamariamarbella.com" },
      { slug: "the-farm-marbella", name: "The Farm Marbella", website: "https://thefarm-marbella.com" },
      { slug: "marbella-4days-walking", name: "Marbella 4Days Walking", website: "https://marbella4dayswalking.com" },
      { slug: "premiere-club", name: "Premiere Club Marbella", website: "https://www.facebook.com/PremiereClubMarbella/" },
      { slug: "nikki-beach-marbella", name: "Nikki Beach Marbella", website: "https://nikkibeach.com/marbella/" },
    ].map(({ slug, ...data }) => prisma.organizer.upsert({ where: { slug }, update: data, create: { slug, ...data } }))
  );
  const organizerBySlug = Object.fromEntries(organizers.map((o) => [o.slug, o]));

  const events: Array<{
    slug: string;
    titleNl: string;
    descriptionNl: string;
    titleEn: string;
    descriptionEn: string;
    titleEs: string;
    descriptionEs: string;
    startsAt: Date;
    endsAt?: Date;
    recurrenceRule?: string;
    venueName: string;
    categorySlug: keyof typeof categoryBySlug;
    organizerSlug?: keyof typeof organizerBySlug;
    // The Source registry row this event's own detail page belongs to
    // (see sourceDefs above) -- and sourceLocale is the language of that
    // specific sourceUrl page, derived per event, never a fixed default.
    sourceKey: keyof typeof sourceByKey;
    sourceUrl: string;
    sourceLocale: "nl" | "en" | "es";
    costType: "FREE" | "PAID" | "UNKNOWN";
    costAmount?: string;
    communityId?: string;
  }> = [
    {
      slug: "premiere-club-easter-triple-headliner-2026",
      titleNl: "Paasweekend Triple Headliner bij Premiere Club",
      descriptionNl:
        "Drie avonden gratis livemuziek bij Premiere Club aan de Plaza de los Olivos: Los Calvin opent op donderdag, The Hype speelt op vrijdag en Mami Curl sluit het Paasweekend triple-headliner-weekend af.",
      titleEn: "Easter Weekend Triple Headliner at Premiere Club",
      descriptionEn:
        "Three nights of free live music at Premiere Club on Plaza de los Olivos: Los Calvin opens on Thursday, The Hype takes the stage Friday, and Mami Curl closes out the Easter weekend triple-headliner.",
      titleEs: "Triple cartel del fin de semana de Pascua en Premiere Club",
      descriptionEs:
        "Tres noches de música en vivo gratuita en Premiere Club, en la Plaza de los Olivos: Los Calvin abre el jueves, The Hype toca el viernes y Mami Curl cierra el fin de semana de Pascua con un triple cartel.",
      startsAt: new Date("2026-04-02T23:30:00+02:00"),
      endsAt: new Date("2026-04-05T02:00:00+02:00"),
      venueName: "Premiere Club, Plaza de los Olivos, Marbella",
      categorySlug: "muziek-uitgaan",
      organizerSlug: "premiere-club",
      sourceKey: "premiere-club",
      sourceUrl:
        "https://euroweeklynews.com/2026/03/30/marbella-premiere-clubs-triple-headliner-weekend-los-calvin-the-hype-mami-curl/",
      sourceLocale: "en",
      costType: "FREE",
    },
    {
      slug: "nikki-beach-23rd-anniversary-disco-del-sol",
      titleNl: "Disco del Sol – 23e Verjaardag",
      descriptionNl:
        "Nikki Beach Marbella viert zijn 23e verjaardag met Disco Fever: een dagfeest in Studio 54-stijl met discoremixen, gouden decor en dansen van de middag tot de avond.",
      titleEn: "Disco del Sol – 23rd Anniversary",
      descriptionEn:
        "Nikki Beach Marbella marks its 23rd anniversary with Disco Fever: a Studio 54-style daytime celebration with disco remixes, golden decor and non-stop dancing from noon into the evening.",
      titleEs: "Disco del Sol – 23º Aniversario",
      descriptionEs:
        "Nikki Beach Marbella celebra su 23º aniversario con Disco Fever: una fiesta diurna al estilo Studio 54 con remixes disco, decoración dorada y baile sin parar desde el mediodía hasta la noche.",
      startsAt: new Date("2026-08-14T12:00:00+02:00"),
      endsAt: new Date("2026-08-14T19:00:00+02:00"),
      venueName: "Nikki Beach Marbella",
      categorySlug: "muziek-uitgaan",
      organizerSlug: "nikki-beach-marbella",
      sourceKey: "nikki-beach",
      sourceUrl: "https://nikkibeach.com/marbella/happenings/disco-del-sol-23rd-anniversary/",
      sourceLocale: "en",
      costType: "UNKNOWN",
    },
  ];

  for (const e of events) {
    // Each event is hand-written in all three of nl/en/es; the one that
    // matches sourceLocale becomes the canonical title/description (as a
    // real scrape would store the text in whatever language the source
    // page is actually in), and the other two are cached as HUMAN
    // translations instead of being live fields.
    const textByLocale: Record<"nl" | "en" | "es", { title: string; description: string }> = {
      nl: { title: e.titleNl, description: e.descriptionNl },
      en: { title: e.titleEn, description: e.descriptionEn },
      es: { title: e.titleEs, description: e.descriptionEs },
    };
    const canonical = textByLocale[e.sourceLocale];

    const eventData = {
      title: canonical.title,
      description: canonical.description,
      sourceLocale: e.sourceLocale,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      recurrenceRule: e.recurrenceRule,
      venueName: e.venueName,
      costType: e.costType,
      costAmount: e.costAmount ?? null,
      regionId: marbella.id,
      communityId: e.communityId ?? null,
      categoryId: categoryBySlug[e.categorySlug].id,
      organizerId: e.organizerSlug ? organizerBySlug[e.organizerSlug].id : null,
      status: "PUBLISHED" as const,
      sourceId: sourceByKey[e.sourceKey].id,
      sourceName: "manual-research",
      sourceUrl: e.sourceUrl,
      externalId: e.slug,
      lastSeenAt: new Date(),
    };
    const event = await prisma.event.upsert({
      where: { slug: e.slug },
      update: eventData,
      create: { slug: e.slug, ...eventData },
    });
    for (const locale of (["nl", "en", "es"] as const).filter((l) => l !== e.sourceLocale)) {
      await seedTranslation("event", event.id, "title", locale, textByLocale[locale].title);
      await seedTranslation("event", event.id, "description", locale, textByLocale[locale].description);
    }

    // Ingestion-time image generation: a no-op if event.imageKey is
    // already set (from an earlier seed run), so this stays cheap on
    // every redeploy after the first. A future scraping script does the
    // same thing right after it creates/upserts an event.
    await getOrGenerateEventImageUrl({
      id: event.id,
      slug: event.slug,
      imageKey: event.imageKey,
      title: event.title,
      description: event.description,
      venueName: event.venueName,
      categoryName: categoryBySlug[e.categorySlug].name,
    });
  }

  console.log(
    `Seeded ${events.length} events for ${marbella.slug}, each canonical in its real source language with the other two locales cached.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
