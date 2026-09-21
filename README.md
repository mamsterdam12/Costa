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
  - `Event` — vertaalbare titel/omschrijving (`title`/`description` zijn
    JSON, bijv. `{ "nl": "...", "en": "...", "es": "..." }`), gekoppeld aan
    regio en categorie.
- **Meertaligheid**: `src/lib/i18n.ts` regelt de vertaling met fallback
  (gekozen taal → NL → eerste beschikbare taal). Taal wisselen via
  `?lang=nl|en|es` in de URL.
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

## Volgende stappen

- Scrapingscript dat nieuwe events vindt (Eventbrite, gemeentekalenders,
  organizer-sites) en upsert via `sourceName`/`externalId`.
- Volledige categorieënboom uit het conceptdocument.
- Organizer/EventSeries/EventInstance voor losstaand beheer van
  terugkerende events.
- Afstandsfilter (vereist coördinaten per event/regio).
- Meer regio's naast Marbella.
