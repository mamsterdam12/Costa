# Costa Community — Events

Eerste module van het Costa Community Platform: "What's On" events per
regio, met meertalige content, klaar voor een toekomstig scrapingscript
dat automatisch nieuwe events vindt.

## Architectuur

- **Next.js (App Router)**, pagina's onder `/[region]` en `/[region]/[event]`
  worden dynamisch gerenderd (geen build-time database-afhankelijkheid).
- **Prisma + Postgres** (`prisma/schema.prisma`):
  - `Region` — recursieve boom (Spanje → Costa del Sol → Marbella → ...),
    zodat elke toeristische plaats later zijn eigen pagina krijgt en het
    platform lokaal aanvoelt, ook al draait alles op één database.
  - `Community` — de residentiële/juridische entiteit (urbanización,
    Comunidad de Propietarios), los van `Region` (dat puur geografisch is).
    Ook recursief. Optioneel op `Event`: de meeste events horen wel bij een
    plaats maar niet bij één specifieke community.
  - `EventCategory` — vertaalbare categorieën.
  - `Organizer` — wie het event organiseert.
  - `Event` — titel/omschrijving zijn platte tekst in de brontaal
    (`sourceLocale`), gekoppeld aan regio, optioneel community en
    categorie. Heeft `createdAt`/`updatedAt` en een optionele
    `createdByUserId` (voor als leden straks zelf events kunnen aanmaken;
    `null` voor seed/scraper-events). `costType` (FREE/PAID/UNKNOWN) plus
    een vrij tekstveld `costAmount` (prijzen zijn vaak niet één bedrag,
    bv. "€5 volwassenen, gratis voor kinderen"). `duplicateOfId`
    verwijst cross-source duplicaten naar het canonieke event zonder ze
    ooit samen te voegen of te verwijderen (zie hieronder). `sourceId`
    linkt naar de geregistreerde `Source` (de algemene site, bv. een
    organizer's eigen website), `sourceUrl` is de specifieke detailpagina
    van dít event — die wordt op de detailpagina getoond als "Meer info".
  - `User` — minimale stub (id, email, naam) voor een latere fase met
    echte accounts; nu alleen nodig als koppelpunt voor
    `Event.createdByUserId`.
  - `Setting` — key/value store voor platform-brede schakelaars, nu alleen
    de handmatige vertaal-circuit-breaker (zie hieronder en `/dashboard`).
  - `Translation` — generieke, herbruikbare vertaalcache voor élk
    vertaalbaar veld van élke entiteit in het platform (nu Event/Region/
    EventCategory, straks Business/Listing/Announcement/forumpost/...),
    sleutel `(entityType, entityId, field, locale)`.
  - `Source` — registratie van scrape-bronnen ("de source database"), los
    van de events zelf. Twee mechanismen werken hiermee: een periodieke,
    AI-ondersteunde discovery-run zoekt nieuwe bronnen en voegt ze hier
    toe (`discoveredBy: AI`, `active: false` tot iemand ze goedkeurt); het
    reguliere scrapen is gewoon deterministische scriptcode (één parser
    per `sourceType`) die alleen de `active` bronnen afgaat. `purpose`
    onderscheidt `EVENTS`-bronnen (rechtstreeks scrapen voor events) van
    `SOURCE_DISCOVERY`-bronnen (aggregators zoals Eventbrite: zelf nooit
    scrapen voor events, wel gebruiken om nieuwe `EVENTS`-bronnen te
    vinden). Een falend scrape-script zet `needsReview: true` op zijn
    `Source`; een AI-agent (of iemand via `/dashboard`) beoordeelt dat
    later. Events blijven via hun eigen `(sourceName, externalId,
    startsAt)` uniek — `startsAt` zit in de sleutel zodat een wekelijks
    terugkerend event (bv. de padel mix-in) niet steeds dezelfde rij
    overschrijft met een nieuwe datum, maar elke week zijn eigen rij
    krijgt. Cross-source duplicaten (hetzelfde event op meerdere sites)
    worden gedetecteerd maar nooit samengevoegd of verwijderd — alleen
    gemarkeerd via `duplicateOfId`, zodat toekomstige per-event data (bv.
    "ik ga erheen"/"ik ben er geweest", nog niet gebouwd) nooit verloren
    gaat.

    Een `Source.url` is de *overzichtspagina* van een organizer/locatie
    (wat een scraper regelmatig zou aflopen om events te vinden) — een
    `Event.sourceUrl` is juist de *specifieke detailpagina* van dat ene
    event, nooit een overzicht. Een aggregator die zelf geen eigen events
    organiseert maar wél veel andere organizers/venues verzamelt (bv. My
    Guide Marbella, net als Eventbrite) hoort als `SOURCE_DISCOVERY`
    geregistreerd te staan: alleen gebruikt om nieuwe `EVENTS`-bronnen te
    vínden, nooit als `sourceId` van een Event. `Event.sourceLocale`
    wordt per event afgeleid van de daadwerkelijke taal van die
    `sourceUrl` (bv. Spaans voor een pagina op marbella.es, Engels voor
    de `/en/`-versie van een clubsite) — nooit een vast "nl" ongeacht de
    bron, anders zou de vertaalcache een verkeerde taal als "brontekst"
    behandelen.
- **Meertaligheid** (`src/lib/translation.ts`): elke module slaat content
  op in precies één brontaal. Een vertaling naar een andere taal wordt
  lazy opgehaald: eerst de `Translation`-cache, en bij een cache-miss een
  LLM-vertaling (OpenAI, via `OPENAI_API_KEY` + `OPENAI_MODEL`) die meteen
  wordt weggeschreven zodat elke vertaling maar één keer gegenereerd hoeft
  te worden. Handmatig gecureerde vertalingen (zoals de EN/ES-teksten in de
  seed) staan met `source: HUMAN` in de cache en worden nooit overschreven
  door een machinevertaling. Nieuwe taal toevoegen (bv. Zweeds, Deens,
  Duits) vereist dus geen her-seeden — de cache vult zichzelf aan zodra
  iemand die taal bezoekt. Zonder `OPENAI_API_KEY`, of als de vertaling om
  wat voor reden dan ook faalt (bv. onjuiste modelnaam), valt het systeem
  terug op de brontekst (geen crash, gewoon nog niet vertaald — zie logs).
  Taal wisselen via `?lang=nl|en|es|de|fr|sv|da` in de URL (7 talen, voor
  huiseigenaren uit o.a. Nederland, VK, Zwitserland, België, Duitsland,
  Zweden en Denemarken). Een handmatige circuit breaker (`Setting`,
  `/dashboard`) kan vertalen helemaal uitzetten — bewust geen automatisch
  herstel, om te voorkomen dat het systeem blijft proberen tegen de OpenAI
  API terwijl er geen credits zijn; na het aanvullen van credits zet je 'm
  zelf weer aan.
- **Klaar voor automatisering**: `Event` heeft `sourceName`, `sourceUrl`,
  `externalId` en `lastSeenAt`, met een unique constraint op
  `(sourceName, externalId)`. Een toekomstig scrapingscript kan hiermee
  events upserten zonder duplicaten te maken, en events die niet meer
  gevonden worden laten "verouderen" via `lastSeenAt`. Nieuw gevonden
  events kunnen als `status: DRAFT` binnenkomen voor review voordat ze
  `PUBLISHED` worden.
- `recurrenceRule` is nu nog een beschrijvend veld (bijv.
  `"WEEKLY;BYDAY=SU"`) voor terugkerende events zoals de wekelijkse
  padel-mix-in. Dit kan later uitgebreid worden naar volledige
  Organizer/EventSeries/EventInstance-objecten zodra losse instances
  nodig zijn.
- **Event-afbeeldingen** (`src/lib/imageGeneration.ts`): gegenereerd op
  het moment dat een event wordt toegevoegd — nu door `prisma/seed.ts`,
  straks door het scrapingscript — nooit tijdens het laden van de pagina.
  Elk event wordt zo maar één keer gegenereerd; herhaalde seed-runs slaan
  events met een bestaande `imageKey` gewoon over. Gebruikt OpenAI's
  Images API (`OPENAI_IMAGE_MODEL`, default `gpt-image-1`) op basis van
  titel/omschrijving/locatie/categorie, met expliciet "no text or logos
  in the image" in de prompt (belangrijk voor het meertalige gebruik: één
  foto moet voor elke taal werken). Opgeslagen in de "costa-media"
  Railway-bucket (`Event.imageKey`). Railway-buckets zijn privé (geen
  publieke URL), dus afbeeldingen worden geserveerd via
  `/api/images/[...key]`, dat de bucket proxyt. Zonder `OPENAI_API_KEY`/
  credits of bucket-configuratie toont de kaart gewoon geen foto (geen
  crash).

- **Dashboard** (`/dashboard`, nog zonder authenticatie — alleen zo privé
  als de URL, moet afgeschermd worden voordat 'ie ergens publiek gelinkt
  wordt): lijst van alle scrape-bronnen (regio, type, doel, aantal events,
  laatst gescraped, status, actief-schakelaar, "nader te bekijken"-vlag),
  plus de aan/uit-schakelaar voor vertalen.
- **Deployment-footer**: elke pagina toont onderaan het deployment-ID, de
  laatste git-commit en een tijdstip (`src/lib/deploymentInfo.ts`,
  `src/components/Footer.tsx`), zodat altijd te zien is welke deploy je
  bekijkt.
- **Scrape-basis** (`src/scrapers/lib/`): een scraper is configuratie, geen
  machinerie. Alles wat lastig is, gebeurt gedeeld:
  - `fetcher.ts` — de enige weg naar het internet. Bewaart elke geslaagde
    respons in `PageSnapshot`, zodat opnieuw draaien (of een parser
    repareren) géén verzoek kost. Verse kopie binnen een uur? Dan gaat
    'ie niet eens het net op. Daarnaast: conditionele verzoeken
    (etag/last-modified, dus 304 zonder body), één verzoek per host per
    3 seconden, `robots.txt` respecteren inclusief `Crawl-delay`, en
    meta-refresh-redirects volgen. Wordt een live ophaalpoging geweigerd
    — SiteGround daagt Railway's IP's standaard uit — dan valt hij terug
    op de laatst opgeslagen kopie (tot 7 dagen oud) en meldt dat
    eerlijk, in plaats van niets op te leveren.
  - `extract.ts` — de gedeelde ladder, meest gestructureerd eerst:
    schema.org JSON-LD → The Events Calendar REST-API → JetEngine
    maandkalender → `<time>`-heuristiek. Elke laag draait alleen als de
    pagina laat zien dat hij van toepassing is, dus een bron die geen
    WordPress-eventsite is kost nul extra verzoeken om daarachter te
    komen.
  - `http.ts` herkent bot-challenges (sgcaptcha, Cloudflare) en stopt
    daar: een CAPTCHA is de site die zegt niet geautomatiseerd te willen
    worden, en dat omzeilen we niet.

  Een nieuwe scraper is daardoor meestal een paar regels: `sourceType`,
  taal, standaardcategorie en eventueel vaste `venueName`/`address`/
  `organizerSlug` (zie `theFarm.ts`). Alleen een bron die niets generieks
  leesbaar publiceert heeft een eigen `extract`-functie nodig.

  `run.ts` is de gedeelde orkestratie:
  haalt de bron op, laat de ladder draaien, upsert events op
  `(sourceName, externalId, startsAt)` (elke herhaling van een event houdt
  zijn eigen rij en id), kent een categorie toe via trefwoordregels (met
  een default per parser), markeert cross-source duplicaten via
  `duplicateOfId` (nooit samenvoegen/verwijderen), genereert de foto op
  het moment van opslaan, en zet `lastScrapedAt`/`lastScrapeStatus`/
  `needsReview` op de bron. Resultaten met lage betrouwbaarheid komen
  binnen als `DRAFT` en vlaggen de bron; een parser die niets vindt of
  faalt zet `needsReview: true` — gokken doet 'ie niet.
  Uitvoeren via de `/scripts`-pagina (**Uitvoeren** gebruikt de
  opgeslagen kopie, **Opnieuw ophalen** forceert een verse fetch) of
  `npm run scrape [sourceType] [--force]` voor een toekomstige cron.
  Zonder authenticatie, net als `/dashboard`.
- **Detailpagina** (`/[region]/[event]`): toont letterlijk elk ingevuld
  veld van het event — titel groot bovenaan, foto, begin-/einddatum,
  herhaling, locatie/adres/coördinaten, categorie, kosten, community,
  organisator, status, brontaal, toegevoegd/laatst gewijzigd — en
  onderaan de bron-link als "Meer info".

## Seed-data

`prisma/seed.ts` registreert eerst de bronnen (`Source`), waaronder My
Guide Marbella als `SOURCE_DISCOVERY` (een aggregator, zoals Eventbrite
— nooit zelf gescraped voor events, alleen gebruikt om nieuwe
`EVENTS`-bronnen te vínden). Twee van de geregistreerde `EVENTS`-bronnen
(Premiere Club Marbella, Nikki Beach Marbella) zijn zo gevonden: via een
discovery-pass over My Guide Marbella's nightlife/events-overzichten,
waarna hun eigen kanaal (Facebook resp. hun officiële events-pagina) is
geverifieerd en geregistreerd, en er vervolgens één echt, via research
gevonden event per bron is toegevoegd — precies het `SOURCE_DISCOVERY`
→ `EVENTS`-bron → event-pijplijn uit de architectuur hierboven, nu voor
het eerst met dit doel uitgevoerd.

Een tweede, bredere discovery-ronde (5 parallelle research-taken, elk op
een eigen domein: cultuur, sport, eten & drinken, nightlife, expat-
community) leverde 11 nieuwe geverifieerde `EVENTS`-bronnen op:
Museo Ralli Marbella, Starlite Festival, Real Club Padel Marbella,
Los Naranjos Golf Club, Casa Pablo, La Sala Puerto Banús, TIBU Banús,
Naô Pool Club, Nederlandse Club Costa del Sol, Marbella Dutch Business
Club en SWEA Marbella. Voor 5 daarvan (Starlite/Maroon 5, Real Club
Padel/AKROS Tournament, Los Naranjos Trophy, Naô Pool Club/Rêve
Festival, La Sala/Halloween-ontbijt) kon een concreet, gedateerd event
met een echte detailpagina bevestigd worden. Voor de overige 6 kon dat
bewust niet: ofwel geen bevestigbare toekomstige datum (Museo Ralli,
Casa Pablo, TIBU Banús), ofwel geen eigen detailpagina naast de
overzichtspagina (NCCS, MDBC, SWEA) — die staan geregistreerd als
`Source` zonder event, in plaats van dat er iets verzonnen is.

Voor elk event is `sourceUrl` de échte specifieke detailpagina (niet een
overzicht) en is `sourceLocale` de taal van díe pagina, zoals hierboven
beschreven — dus bv. Engels voor zowel Premiere Club
(euroweeklynews.com) als Nikki Beach (nikkibeach.com). De canonieke
`title`/`description` van elk event staan in die brontaal; de andere
twee talen komen uit de handmatig gecureerde `Translation`-cache
(`source: HUMAN`), niet uit een live veld.

## Ontwikkelen

```bash
npm install
# DATABASE_URL nodig, bv. via `railway run` tegen de Postgres op Railway
npx prisma db push
npx prisma db seed
npm run dev
```

## Deployen (Railway)

De Railway-service "Costa" is al gekoppeld aan deze GitHub-repo en aan de
Postgres-database in hetzelfde project. Het pre-deploy commando voert bij
elke deploy `prisma db push` en `prisma db seed` uit (idempotent, dus
veilig om steeds opnieuw te draaien).

## Environment variables (Railway)

- `OPENAI_API_KEY` / `OPENAI_MODEL` — vertaling (chat completions).
- `OPENAI_IMAGE_MODEL` — beeldgeneratie (default `gpt-image-1`).
- `BUCKET` / `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` / `REGION` / `ENDPOINT`
  — S3-credentials van de "costa-media" Railway-bucket, als variable
  references (`${{costa-media.BUCKET}}` etc.) op de Costa-service gezet.

Zonder geldige OpenAI-key/credits werkt de site gewoon door: vertaling
valt terug op de brontekst, afbeeldingen blijven leeg. Zie de deploy-logs
voor de exacte reden (bv. "no credits remaining").

## Volgende stappen

- Scrapingscript dat nieuwe events vindt (Eventbrite, gemeentekalenders,
  organizer-sites) en upsert via `sourceName`/`externalId`.
- Volledige categorieënboom uit het conceptdocument.
- Organizer/EventSeries/EventInstance voor losstaand beheer van
  terugkerende events.
- Afstandsfilter (vereist coördinaten per event/regio).
- Meer regio's naast Marbella.
