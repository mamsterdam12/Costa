import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const spain = await prisma.region.upsert({
    where: { slug: "spanje" },
    update: {},
    create: {
      slug: "spanje",
      name: { nl: "Spanje", en: "Spain", es: "España" },
      country: "ES",
    },
  });

  const costaDelSol = await prisma.region.upsert({
    where: { slug: "costa-del-sol" },
    update: {},
    create: {
      slug: "costa-del-sol",
      name: { nl: "Costa del Sol", en: "Costa del Sol", es: "Costa del Sol" },
      country: "ES",
      parentId: spain.id,
    },
  });

  const marbella = await prisma.region.upsert({
    where: { slug: "marbella" },
    update: {},
    create: {
      slug: "marbella",
      name: { nl: "Marbella", en: "Marbella", es: "Marbella" },
      country: "ES",
      parentId: costaDelSol.id,
      latitude: 36.5108,
      longitude: -4.8856,
    },
  });

  const categories = await Promise.all(
    [
      {
        slug: "sport-fitness",
        name: { nl: "Sport & fitness", en: "Sport & fitness", es: "Deporte y fitness" },
      },
      {
        slug: "eten-drinken",
        name: { nl: "Eten & drinken", en: "Food & drink", es: "Comida y bebida" },
      },
      {
        slug: "muziek-uitgaan",
        name: { nl: "Muziek & uitgaan", en: "Music & nightlife", es: "Música y ocio nocturno" },
      },
      {
        slug: "markten-shopping",
        name: { nl: "Markten & shopping", en: "Markets & shopping", es: "Mercados y compras" },
      },
      {
        slug: "cultuur",
        name: { nl: "Cultuur", en: "Culture", es: "Cultura" },
      },
    ].map((c) =>
      prisma.eventCategory.upsert({ where: { slug: c.slug }, update: {}, create: c })
    )
  );
  const categoryBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  const organizers = await Promise.all(
    [
      { slug: "ayuntamiento-marbella", name: "Ayuntamiento de Marbella", website: "https://www.marbella.es" },
      { slug: "manolo-santana-club", name: "Manolo Santana Racquets Club", website: "https://manolosantana.es" },
      { slug: "tablao-ana-maria", name: "Tablao Flamenco Ana Maria" },
      { slug: "the-farm-marbella", name: "The Farm Marbella", website: "https://thefarm-marbella.com" },
    ].map((o) => prisma.organizer.upsert({ where: { slug: o.slug }, update: {}, create: o }))
  );
  const organizerBySlug = Object.fromEntries(organizers.map((o) => [o.slug, o]));

  const events: Array<{
    slug: string;
    title: Record<string, string>;
    description: Record<string, string>;
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
      title: {
        nl: "TodoDanza Festival",
        en: "TodoDanza Festival",
        es: "Festival TodoDanza",
      },
      description: {
        nl: "16e editie van het TodoDanza Festival: hedendaagse dans en flamenco met 13 gezelschappen en meer dan 40 artiesten, verspreid over meerdere locaties in Marbella.",
        en: "16th edition of the TodoDanza Festival: contemporary dance and flamenco performances with 13 companies and over 40 artists across several venues in Marbella.",
        es: "16ª edición del Festival TodoDanza: danza contemporánea y flamenco con 13 compañías y más de 40 artistas en varias sedes de Marbella.",
      },
      startsAt: new Date("2026-10-04T19:00:00+02:00"),
      endsAt: new Date("2026-11-08T22:00:00+01:00"),
      venueName: "Teatro Ciudad de Marbella",
      categorySlug: "cultuur",
      organizerSlug: "ayuntamiento-marbella",
      sourceUrl: "https://www.marbella.es",
    },
    {
      slug: "marbella-4-days-walking-2026",
      title: {
        nl: "Marbella 4 Days Walking",
        en: "Marbella 4 Days Walking",
        es: "Marbella 4 Days Walking",
      },
      description: {
        nl: "Vier dagen wandelen door Marbella met routes van 10, 20 of 30 kilometer per dag, samen met duizenden andere deelnemers.",
        en: "Four days of walking through Marbella with 10, 20 or 30 km routes each day, alongside thousands of other participants.",
        es: "Cuatro días caminando por Marbella con rutas de 10, 20 o 30 km cada día, junto a miles de participantes.",
      },
      startsAt: new Date("2026-10-14T09:00:00+02:00"),
      endsAt: new Date("2026-10-17T14:00:00+02:00"),
      venueName: "Startpunt centrum Marbella",
      categorySlug: "sport-fitness",
      organizerSlug: "ayuntamiento-marbella",
      sourceUrl: "https://www.marbella.es",
    },
    {
      slug: "weekmarkt-marbella-maandag",
      title: {
        nl: "Wekelijkse markt Marbella",
        en: "Marbella weekly street market",
        es: "Mercadillo semanal de Marbella",
      },
      description: {
        nl: "Elke maandag houdt Marbella zijn weekmarkt met verse producten, kleding, sieraden en meer.",
        en: "Every Monday Marbella holds its weekly street market with fresh produce, clothing, jewellery and more.",
        es: "Cada lunes Marbella celebra su mercadillo semanal con productos frescos, ropa, joyería y más.",
      },
      startsAt: new Date("2026-09-28T09:00:00+02:00"),
      endsAt: new Date("2026-09-28T14:00:00+02:00"),
      recurrenceRule: "WEEKLY;BYDAY=MO",
      venueName: "Avenida Doctor Maiz Viñals, Marbella",
      categorySlug: "markten-shopping",
      sourceUrl: "https://www.myguidemarbella.com/nl/evenementen",
    },
    {
      slug: "sunday-padel-mix-in",
      title: {
        nl: "Sunday Padel Mix-In",
        en: "Sunday Padel Mix-In",
        es: "Mix-In de pádel del domingo",
      },
      description: {
        nl: "Wekelijkse gemengde padel mix-in voor niveau 1-4, inclusief BBQ na afloop.",
        en: "Weekly mixed-level padel mix-in for levels 1-4, with a BBQ afterwards.",
        es: "Mix-in de pádel semanal para niveles 1-4, con barbacoa al finalizar.",
      },
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
      title: {
        nl: "Flamenco Show",
        en: "Flamenco Show",
        es: "Espectáculo de flamenco",
      },
      description: {
        nl: "Anderhalf uur pure flamenco: gitaar, zang en dans in het historische centrum van Marbella.",
        en: "An hour and a half of pure flamenco: guitar, singing and dance in Marbella's historic old town.",
        es: "Hora y media de flamenco puro: guitarra, cante y baile en el casco antiguo de Marbella.",
      },
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
      title: {
        nl: "Live Flamenco & DJ Night",
        en: "Live Flamenco & DJ Night",
        es: "Noche de flamenco en vivo y DJ",
      },
      description: {
        nl: "Live flamenco gevolgd door een DJ-set in het oude centrum van Marbella.",
        en: "Live flamenco followed by a DJ set in Marbella's old town.",
        es: "Flamenco en directo seguido de sesión de DJ en el casco antiguo de Marbella.",
      },
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
    await prisma.event.upsert({
      where: { slug: e.slug },
      update: {},
      create: {
        slug: e.slug,
        title: e.title,
        description: e.description,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        recurrenceRule: e.recurrenceRule,
        venueName: e.venueName,
        regionId: marbella.id,
        categoryId: categoryBySlug[e.categorySlug].id,
        organizerId: e.organizerSlug ? organizerBySlug[e.organizerSlug].id : null,
        status: "PUBLISHED",
        sourceName: "manual-research",
        sourceUrl: e.sourceUrl,
        externalId: e.slug,
        lastSeenAt: new Date(),
      },
    });
  }

  console.log(`Seeded ${events.length} events for ${marbella.slug}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
