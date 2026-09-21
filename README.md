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
- **Detailpagina** (`/[region]/[event]`): toont letterlijk elk ingevuld
  veld van het event — titel groot bovenaan, foto, begin-/einddatum,
  herhaling, locatie/adres/coördinaten, categorie, kosten, community,
  organisator, status, brontaal, toegevoegd/laatst gewijzigd — en
  onderaan de bron-link als "Meer info".

## Seed-data

`prisma/seed.ts` bevat echte, via research gevonden events in Marbella:
TodoDanza Festival, Marbella 4 Days Walking, de wekelijkse maandagmarkt,
de Sunday Padel Mix-In bij Manolo Santana Club, en flamenco/live-muziek
avonden — elk met NL/EN/ES-vertalingen en, waar te achterhalen,
kosteninformatie uit dezelfde research (bv. TodoDanza €15, Marbella 4
Days Walking €25/dag). De padel mix-in is gekoppeld aan een voorbeeld-
`Community` (Nueva Andalucía) om dat veld te demonstreren.

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
