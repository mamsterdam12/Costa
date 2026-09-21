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
  - `EventCategory` — vertaalbare categorieën.
  - `Organizer` — wie het event organiseert.
  - `Event` — titel/omschrijving zijn platte tekst in de brontaal
    (`sourceLocale`), gekoppeld aan regio en categorie.
  - `Translation` — generieke, herbruikbare vertaalcache voor élk
    vertaalbaar veld van élke entiteit in het platform (nu Event/Region/
    EventCategory, straks Business/Listing/Announcement/forumpost/...),
    sleutel `(entityType, entityId, field, locale)`.
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
  Taal wisselen via `?lang=nl|en|es` in de URL.
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

## Seed-data

`prisma/seed.ts` bevat echte, via research gevonden events in Marbella:
TodoDanza Festival, Marbella 4 Days Walking, de wekelijkse maandagmarkt,
de Sunday Padel Mix-In bij Manolo Santana Club, en flamenco/live-muziek
avonden — elk met NL/EN/ES-vertalingen.

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
