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
      // Has a scraper: src/scrapers/turismoMarbella.ts (see registry.ts).
      sourceType: "turismo-marbella",
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
      // Has a dedicated parser: src/scrapers/theFarm.ts (see registry.ts).
      sourceType: "the-farm",
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
    // Second discovery pass (5 parallel research agents, one per domain:
    // culture, sport, food & drink, nightlife, expat community), each
    // verifying candidates independently via web search. Registered here
    // regardless of whether a current event could be confirmed for it --
    // a Source existing with zero events yet is normal (see /dashboard);
    // only 5 of these 11 got a real, dated, sourced event added below,
    // because the other 6 either had no confirmable upcoming date or no
    // genuine per-event detail page, and guessing either would violate
    // the no-fabrication rule this seed otherwise follows throughout.
    {
      key: "museo-ralli",
      name: "Museo Ralli Marbella",
      url: "https://museoralli.es/exposiciones/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
      notes: "Private art museum; found a current exhibition but couldn't confirm its year, so no event added yet.",
    },
    {
      key: "starlite-festival",
      name: "Starlite Festival",
      url: "https://starlitefestival.com/programacion",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
    },
    {
      key: "real-club-padel-marbella",
      name: "Real Club Padel Marbella",
      url: "https://realclubpadelmarbella.com/blog/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
    },
    {
      key: "los-naranjos-golf",
      name: "Los Naranjos Golf Club",
      url: "https://losnaranjos.com/en/calendar-of-events/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
    },
    {
      key: "casa-pablo",
      name: "Casa Pablo",
      url: "https://casapablo.es/catas-de-vino-y-eventos-en-marbella/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
      notes: "Recurring monthly wine tastings confirmed, but no date after today found -- no event added yet.",
    },
    {
      key: "la-sala-puerto-banus",
      name: "La Sala Puerto Banús",
      url: "https://lasalabanus.com/live-music/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
    },
    {
      key: "tibu-banus",
      name: "TIBU Banús",
      url: "https://tibubanus.com/tibu-events/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
      notes: "Recurring Friday night series (Mayfair Sessions) confirmed, but no specific upcoming date found -- no event added yet.",
    },
    {
      key: "nao-pool-club",
      name: "Naô Pool Club",
      url: "https://naopoolclub.com/event-directory/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
    },
    {
      key: "nccs",
      name: "Nederlandse Club Costa del Sol",
      url: "https://www.nederlandseclub.nl/jaarplanning/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
      notes: "Dutch expat association; found an upcoming inloopborrel but no venue/price/detail page confirmed -- no event added yet.",
    },
    {
      key: "mdbc",
      name: "Marbella Dutch Business Club",
      url: "https://marbelladutchbusinessclub.nl/agenda-mdbc/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
      notes: "Dutch business network; found an upcoming talk but no venue/price/detail page confirmed -- no event added yet.",
    },
    {
      key: "swea-marbella",
      name: "SWEA Marbella",
      url: "https://marbella.swea.org/aktiviteter/",
      sourceType: "html-listing",
      purpose: "EVENTS",
      discoveredBy: "AI",
      notes: "Swedish Women's Educational Association chapter; genuine per-event page structure confirmed, but no currently-upcoming event could be verified -- no event added yet.",
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
      { slug: "starlite-festival", name: "Starlite Festival", website: "https://starlitefestival.com" },
      { slug: "real-club-padel-marbella", name: "Real Club Padel Marbella", website: "https://realclubpadelmarbella.com" },
      { slug: "los-naranjos-golf", name: "Los Naranjos Golf Club", website: "https://losnaranjos.com" },
      { slug: "nao-pool-club", name: "Naô Pool Club", website: "https://naopoolclub.com" },
      { slug: "la-sala-puerto-banus", name: "La Sala Puerto Banús", website: "https://lasalabanus.com" },
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
    // Third batch: 5 parallel research agents, one per newly-registered
    // source pair/trio above, each independently finding one real,
    // dated, sourced event. Exact times weren't always confirmed by the
    // source (flagged per-event below); where that happened a reasonable
    // default time is used rather than leaving startsAt (a required
    // field) unset -- the date itself is always real and verified.
    {
      slug: "starlite-maroon5-2026",
      titleNl: "Maroon 5 bij Starlite Occident",
      descriptionNl:
        "Maroon 5 geeft een liveconcert in het Starlite Occident-auditorium in Cantera de Nagüeles, onderdeel van het Starlite Festival-seizoen 2026.",
      titleEn: "Maroon 5 at Starlite Occident",
      descriptionEn:
        "Maroon 5 play a live concert at the Starlite Occident auditorium in Cantera de Nagüeles, part of the Starlite Festival's 2026 season.",
      titleEs: "Maroon 5 en Starlite Occident",
      descriptionEs:
        "Maroon 5 ofrece un concierto en directo en el auditorio de Starlite Occident, en la Cantera de Nagüeles, dentro de la temporada 2026 del Festival Starlite.",
      // Date confirmed via ticket vendors; exact show time not confirmed
      // for this specific concert -- 22:00 is Starlite's typical slot.
      startsAt: new Date("2026-07-07T22:00:00+02:00"),
      venueName: "Starlite Auditorium, Cantera de Nagüeles, Marbella",
      categorySlug: "muziek-uitgaan",
      organizerSlug: "starlite-festival",
      sourceKey: "starlite-festival",
      sourceUrl: "https://starlitefestival.com/en/eventoconcierto/maroon-5/",
      sourceLocale: "en",
      costType: "UNKNOWN",
    },
    {
      slug: "akros-tournament-show-2026",
      titleNl: "AKROS Tournament & Show",
      descriptionNl:
        "Een padel- en gymnastiektoernooi voor alle AKROS-academieniveaus bij Real Club Padel Marbella, afgesloten met een show van de Advanced Group.",
      titleEn: "AKROS Tournament & Show",
      descriptionEn:
        "A padel and gymnastics tournament for all AKROS academy levels at Real Club Padel Marbella, capped off with a show performance by the Advanced Group.",
      titleEs: "AKROS Tournament & Show",
      descriptionEs:
        "Un torneo de pádel y gimnasia para todos los niveles de la academia AKROS en Real Club Padel Marbella, con una exhibición final del Grupo Avanzado.",
      // Dates confirmed (June 13-14, 2026); no specific times found, so a
      // typical weekend-tournament schedule is used.
      startsAt: new Date("2026-06-13T09:00:00+02:00"),
      endsAt: new Date("2026-06-14T19:00:00+02:00"),
      venueName: "Real Club Padel Marbella, Nueva Andalucía",
      categorySlug: "sport-fitness",
      organizerSlug: "real-club-padel-marbella",
      sourceKey: "real-club-padel-marbella",
      sourceUrl: "https://realclubpadelmarbella.com/es/akros-tournament-show-june-2026/",
      sourceLocale: "en",
      costType: "UNKNOWN",
      communityId: nuevaAndalucia.id,
    },
    {
      slug: "los-naranjos-trophy-2026",
      titleNl: "Los Naranjos Trophy (32e editie)",
      descriptionNl:
        "Een viedaags amateurgolftoernooi (72 holes) bij Los Naranjos Golf Club, open voor spelers van alle nationaliteiten en niveaus, met dagelijkse prijsuitreikingen en een afsluitend galadiner.",
      titleEn: "Los Naranjos Trophy (32nd Edition)",
      descriptionEn:
        "A 4-day, 72-hole amateur golf competition at Los Naranjos Golf Club, open to players of all nationalities and levels, with daily prize-giving cocktails and a closing gala dinner.",
      titleEs: "Los Naranjos Trophy (32ª edición)",
      descriptionEs:
        "Un torneo de golf amateur de 4 días (72 hoyos) en Los Naranjos Golf Club, abierto a jugadores de todas las nacionalidades y niveles, con cócteles diarios de entrega de premios y una cena de gala de clausura.",
      // Dates from a secondary (not primary-page) source, cross-referenced
      // but not 100% confirmed -- reported as-is, not fabricated from
      // nothing.
      startsAt: new Date("2026-04-26T09:00:00+02:00"),
      endsAt: new Date("2026-04-29T20:00:00+02:00"),
      venueName: "Los Naranjos Golf Club, Nueva Andalucía",
      categorySlug: "sport-fitness",
      organizerSlug: "los-naranjos-golf",
      sourceKey: "los-naranjos-golf",
      sourceUrl: "https://losnaranjos.com/en/trophy-tournament/",
      sourceLocale: "en",
      costType: "UNKNOWN",
      communityId: nuevaAndalucia.id,
    },
    {
      slug: "reve-festival-sept-2026",
      titleNl: "Rêve Festival",
      descriptionNl:
        "Een maandelijks avondfeest bij Naô Pool Club met internationale house- en techno-dj's; deze editie in september begint vroeg in de middag.",
      titleEn: "Rêve Festival",
      descriptionEn:
        "A monthly evening party at Naô Pool Club with international house and techno DJs; this September edition starts in the early afternoon.",
      titleEs: "Rêve Festival",
      descriptionEs:
        "Una fiesta mensual en Naô Pool Club con DJs internacionales de house y techno; esta edición de septiembre comienza a primera hora de la tarde.",
      startsAt: new Date("2026-09-26T13:00:00+02:00"),
      venueName: "Naô Pool Club, Nueva Andalucía",
      categorySlug: "muziek-uitgaan",
      organizerSlug: "nao-pool-club",
      sourceKey: "nao-pool-club",
      sourceUrl: "https://naopoolclub.com/events/reve-festival/",
      sourceLocale: "en",
      costType: "UNKNOWN",
      communityId: nuevaAndalucia.id,
    },
    {
      slug: "la-sala-halloween-breakfast-2026",
      titleNl: "Fang-Tastic Breakfast Bash",
      descriptionNl:
        "Een Halloween-themaontbijt voor het hele gezin in de Live Lounge van La Sala, met entertainment van Breakfast Club Junior, interactieve Halloweenspelletjes en een prijs voor het best verklede gezin.",
      titleEn: "Fang-Tastic Breakfast Bash",
      descriptionEn:
        "A Halloween-themed family breakfast in La Sala's Live Lounge, with entertainment from Breakfast Club Junior, interactive Halloween games, and a prize for best-dressed family.",
      titleEs: "Fang-Tastic Breakfast Bash",
      descriptionEs:
        "Un desayuno familiar con temática de Halloween en el Live Lounge de La Sala, con animación de Breakfast Club Junior, juegos interactivos de Halloween y un premio a la familia mejor disfrazada.",
      startsAt: new Date("2026-10-25T11:00:00+01:00"),
      endsAt: new Date("2026-10-26T12:30:00+01:00"),
      venueName: "La Sala Puerto Banús, Live Lounge",
      categorySlug: "eten-drinken",
      organizerSlug: "la-sala-puerto-banus",
      sourceKey: "la-sala-puerto-banus",
      sourceUrl: "https://lasalabanus.com/halloween/",
      sourceLocale: "en",
      costType: "PAID",
      costAmount: "€24 per persoon (incl. ontbijt en drankje), onder 2 jaar gratis",
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
