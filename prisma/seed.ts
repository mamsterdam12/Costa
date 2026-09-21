import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Pre-seeds the shared Translation cache with curated EN/ES copy (marked
// HUMAN so the lazy machine-translation path never overwrites it). Any
// other locale (Swedish, German, Danish, ...) simply isn't cached yet, and
// gets machine-translated + cached the first time someone requests it.
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

  const organizers = await Promise.all(
    [
      { slug: "ayuntamiento-marbella", name: "Ayuntamiento de Marbella", website: "https://www.marbella.es" },
      { slug: "manolo-santana-club", name: "Manolo Santana Racquets Club", website: "https://manolosantana.es" },
      { slug: "tablao-ana-maria", name: "Tablao Flamenco Ana Maria" },
      { slug: "the-farm-marbella", name: "The Farm Marbella", website: "https://thefarm-marbella.com" },
    ].map(({ slug, ...data }) => prisma.organizer.upsert({ where: { slug }, update: data, create: { slug, ...data } }))
  );
  const organizerBySlug = Object.fromEntries(organizers.map((o) => [o.slug, o]));

  const events: Array<{
    slug: string;
    title: string;
    description: string;
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
    sourceUrl: string;
  }> = [
    {
      slug: "tododanza-festival-2026",
      title: "TodoDanza Festival",
      description:
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
      sourceUrl: "https://www.marbella.es",
    },
    {
      slug: "marbella-4-days-walking-2026",
      title: "Marbella 4 Days Walking",
      description:
        "Vier dagen wandelen door Marbella met routes van 10, 20 of 30 kilometer per dag, samen met duizenden andere deelnemers.",
      titleEn: "Marbella 4 Days Walking",
      descriptionEn:
        "Four days of walking through Marbella with 10, 20 or 30 km routes each day, alongside thousands of other participants.",
      titleEs: "Marbella 4 Days Walking",
      descriptionEs:
        "Cuatro días caminando por Marbella con rutas de 10, 20 o 30 km cada día, junto a miles de participantes.",
      startsAt: new Date("2026-10-14T09:00:00+02:00"),
      endsAt: new Date("2026-10-17T14:00:00+02:00"),
      venueName: "Startpunt centrum Marbella",
      categorySlug: "sport-fitness",
      organizerSlug: "ayuntamiento-marbella",
      sourceUrl: "https://www.marbella.es",
    },
    {
      slug: "weekmarkt-marbella-maandag",
      title: "Wekelijkse markt Marbella",
      description:
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
      sourceUrl: "https://www.myguidemarbella.com/nl/evenementen",
    },
    {
      slug: "sunday-padel-mix-in",
      title: "Sunday Padel Mix-In",
      description: "Wekelijkse gemengde padel mix-in voor niveau 1-4, inclusief BBQ na afloop.",
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
      sourceUrl: "https://manolosantana.es/en/mixin-paddle-tennis-matches/",
    },
    {
      slug: "flamenco-show-ana-maria",
      title: "Flamenco Show",
      description:
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
      sourceUrl: "https://www.myguidemarbella.com/nightlife/live-music-bars",
    },
    {
      slug: "the-farm-live-flamenco-dj",
      title: "Live Flamenco & DJ Night",
      description: "Live flamenco gevolgd door een DJ-set in het oude centrum van Marbella.",
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
      sourceUrl: "https://thefarm-marbella.com/whats-on/",
    },
  ];

  for (const e of events) {
    const eventData = {
      title: e.title,
      description: e.description,
      sourceLocale: "nl",
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      recurrenceRule: e.recurrenceRule,
      venueName: e.venueName,
      regionId: marbella.id,
      categoryId: categoryBySlug[e.categorySlug].id,
      organizerId: e.organizerSlug ? organizerBySlug[e.organizerSlug].id : null,
      status: "PUBLISHED" as const,
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
    await seedTranslation("event", event.id, "title", "en", e.titleEn);
    await seedTranslation("event", event.id, "description", "en", e.descriptionEn);
    await seedTranslation("event", event.id, "title", "es", e.titleEs);
    await seedTranslation("event", event.id, "description", "es", e.descriptionEs);
  }

  console.log(`Seeded ${events.length} events for ${marbella.slug}, with EN/ES translations cached.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
