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
  // and re-visit. discoveredBy: MANUAL/active: true since a person (this
  // seed) vetted them; a periodic AI discovery run would instead insert
  // new rows here with discoveredBy: AI, active: false, pending review.
  //
  // Each `url` here is the organizer's own EVENTS overview page (what a
  // regular scraper script would crawl) -- distinct from an individual
  // Event's own `sourceUrl`, which is that one event's specific detail
  // page. purpose: SOURCE_DISCOVERY marks aggregators (like My Guide
  // Marbella, a travel-guide directory covering many unrelated venues,
  // the same role Eventbrite would play) that periodic AI discovery runs
  // use to *find* new EVENTS sources -- never scraped for events directly,
  // so no Event ever links to one via sourceKey below.
  const sourceDefs = [
    {
      key: "ayuntamiento-marbella",
      name: "Ayuntamiento de Marbella (Turismo agenda)",
      url: "https://turismo.marbella.es/agenda.html",
      sourceType: "html-listing",
      purpose: "EVENTS" as const,
    },
    {
      key: "manolo-santana",
      name: "Manolo Santana Racquets Club",
      url: "https://manolosantana.es/en/mixin-paddle-tennis-matches/",
      sourceType: "html-listing",
      purpose: "EVENTS" as const,
    },
    {
      key: "tablao-ana-maria",
      name: "Tablao Flamenco Ana Maria",
      url: "https://www.flamencoanamariamarbella.com/",
      sourceType: "html-listing",
      purpose: "EVENTS" as const,
    },
    {
      key: "the-farm",
      name: "The Farm Marbella",
      url: "https://thefarm-marbella.com/whats-on/",
      sourceType: "html-listing",
      purpose: "EVENTS" as const,
    },
    {
      key: "marbella4dayswalking",
      name: "Marbella 4Days Walking",
      url: "https://marbella4dayswalking.com/",
      sourceType: "html-listing",
      purpose: "EVENTS" as const,
    },
    {
      key: "myguide-marbella",
      name: "My Guide Marbella",
      url: "https://www.myguidemarbella.com/",
      sourceType: "html-listing",
      purpose: "SOURCE_DISCOVERY" as const,
      notes: "Travel-guide directory covering many unrelated venues (like Eventbrite) -- a source for finding sources, not for scraping events directly.",
    },
  ];
  const sourceByKey: Record<string, Awaited<ReturnType<typeof prisma.source.upsert>>> = {};
  for (const { key, ...s } of sourceDefs) {
    sourceByKey[key] = await prisma.source.upsert({
      where: { url: s.url },
      update: { name: s.name, sourceType: s.sourceType, purpose: s.purpose, regionId: marbella.id },
      create: { ...s, regionId: marbella.id, discoveredBy: "MANUAL", active: true },
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
      slug: "tododanza-festival-2026",
      titleNl: "TodoDanza Festival",
      descriptionNl:
        "16e editie van het TodoDanza Festival: hedendaagse dans en flamenco met 13 gezelschappen en meer dan 40 artiesten, verspreid over meerdere locaties in Marbella.",
      titleEn: "TodoDanza Festival",
      descriptionEn:
        "16th edition of the TodoDanza Festival: contemporary dance and flamenco performances with 13 companies and over 40 artists across several venues in Marbella.",
      titleEs: "Festival TodoDanza",
      descriptionEs:
        "16ª edición del Festival TodoDanza: danza contemporánea y flamenco con 13 compañías y más de 40 artistas en varias sedes de Marbella.",
      startsAt: new Date("2026-10-04T19:00:00+02:00"),
      endsAt: new Date("2026-11-08T22:00:00+01:00"),
      venueName: "Teatro Ciudad de Marbella",
      categorySlug: "cultuur",
      organizerSlug: "ayuntamiento-marbella",
      sourceKey: "ayuntamiento-marbella",
      sourceUrl: "https://turismo.marbella.es/agenda/festival-marbella-todo-danza.html",
      sourceLocale: "es",
      costType: "PAID",
      costAmount: "€15",
    },
    {
      slug: "marbella-4-days-walking-2026",
      titleNl: "Marbella 4 Days Walking",
      descriptionNl:
        "Vier dagen wandelen door Marbella met routes van 10, 20 of 30 kilometer per dag, samen met duizenden andere deelnemers.",
      titleEn: "Marbella 4 Days Walking",
      descriptionEn:
        "Four days of walking through Marbella with 10, 20 or 30 km routes each day, alongside thousands of other participants.",
      titleEs: "Marbella 4 Days Walking",
      descriptionEs:
        "Cuatro días caminando por Marbella con rutas de 10, 20 o 30 km cada día, junto a miles de participantes.",
      startsAt: new Date("2026-10-01T09:00:00+02:00"),
      endsAt: new Date("2026-10-04T14:00:00+02:00"),
      venueName: "Startpunt centrum Marbella",
      categorySlug: "sport-fitness",
      organizerSlug: "marbella-4days-walking",
      sourceKey: "marbella4dayswalking",
      sourceUrl: "https://marbella4dayswalking.com/",
      sourceLocale: "nl",
      costType: "PAID",
      costAmount: "€25 per dag, of €85 voor alle 4 dagen (online registratie)",
    },
    {
      slug: "weekmarkt-marbella-maandag",
      titleNl: "Wekelijkse markt Marbella",
      descriptionNl:
        "Elke maandag houdt Marbella zijn weekmarkt met verse producten, kleding, sieraden en meer.",
      titleEn: "Marbella weekly street market",
      descriptionEn:
        "Every Monday Marbella holds its weekly street market with fresh produce, clothing, jewellery and more.",
      titleEs: "Mercadillo semanal de Marbella",
      descriptionEs:
        "Cada lunes Marbella celebra su mercadillo semanal con productos frescos, ropa, joyería y más.",
      startsAt: new Date("2026-09-28T09:00:00+02:00"),
      endsAt: new Date("2026-09-28T14:00:00+02:00"),
      recurrenceRule: "WEEKLY;BYDAY=MO",
      venueName: "Avenida Doctor Maiz Viñals, Marbella",
      categorySlug: "markten-shopping",
      sourceKey: "ayuntamiento-marbella",
      sourceUrl:
        "https://turismo.marbella.es/vive/compras/mercados-de-abastos-y-mercadillos/mercadillo-marbella.html",
      sourceLocale: "es",
      costType: "FREE",
    },
    {
      slug: "sunday-padel-mix-in",
      titleNl: "Sunday Padel Mix-In",
      descriptionNl: "Wekelijkse gemengde padel mix-in voor niveau 1-4, inclusief BBQ na afloop.",
      titleEn: "Sunday Padel Mix-In",
      descriptionEn: "Weekly mixed-level padel mix-in for levels 1-4, with a BBQ afterwards.",
      titleEs: "Mix-In de pádel del domingo",
      descriptionEs: "Mix-in de pádel semanal para niveles 1-4, con barbacoa al finalizar.",
      startsAt: new Date("2026-09-27T12:00:00+02:00"),
      endsAt: new Date("2026-09-27T14:00:00+02:00"),
      recurrenceRule: "WEEKLY;BYDAY=SU",
      venueName: "Manolo Santana Racquets Club",
      categorySlug: "sport-fitness",
      organizerSlug: "manolo-santana-club",
      sourceKey: "manolo-santana",
      sourceUrl: "https://manolosantana.es/en/mixin-paddle-tennis-matches/",
      sourceLocale: "en",
      costType: "UNKNOWN",
      communityId: nuevaAndalucia.id,
    },
    {
      slug: "flamenco-show-ana-maria",
      titleNl: "Flamenco Show",
      descriptionNl:
        "Anderhalf uur pure flamenco: gitaar, zang en dans in het historische centrum van Marbella.",
      titleEn: "Flamenco Show",
      descriptionEn:
        "An hour and a half of pure flamenco: guitar, singing and dance in Marbella's historic old town.",
      titleEs: "Espectáculo de flamenco",
      descriptionEs:
        "Hora y media de flamenco puro: guitarra, cante y baile en el casco antiguo de Marbella.",
      startsAt: new Date("2026-09-24T21:00:00+02:00"),
      endsAt: new Date("2026-09-24T22:30:00+02:00"),
      recurrenceRule: "WEEKLY",
      venueName: "Tablao Flamenco Ana Maria, Marbella Old Town",
      categorySlug: "muziek-uitgaan",
      organizerSlug: "tablao-ana-maria",
      sourceKey: "tablao-ana-maria",
      sourceUrl: "https://www.flamencoanamariamarbella.com/",
      sourceLocale: "es",
      costType: "PAID",
      costAmount: "€39-€85, afhankelijk van drankje of diner erbij",
    },
    {
      slug: "the-farm-live-flamenco-dj",
      titleNl: "Live Flamenco & DJ Night",
      descriptionNl: "Live flamenco gevolgd door een DJ-set in het oude centrum van Marbella.",
      titleEn: "Live Flamenco & DJ Night",
      descriptionEn: "Live flamenco followed by a DJ set in Marbella's old town.",
      titleEs: "Noche de flamenco en vivo y DJ",
      descriptionEs: "Flamenco en directo seguido de sesión de DJ en el casco antiguo de Marbella.",
      startsAt: new Date("2026-09-25T22:00:00+02:00"),
      endsAt: new Date("2026-09-26T01:00:00+02:00"),
      recurrenceRule: "WEEKLY;BYDAY=FR",
      venueName: "The Farm Marbella",
      categorySlug: "muziek-uitgaan",
      organizerSlug: "the-farm-marbella",
      sourceKey: "the-farm",
      sourceUrl: "https://thefarm-marbella.com/whats-on/",
      sourceLocale: "en",
      costType: "FREE",
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
