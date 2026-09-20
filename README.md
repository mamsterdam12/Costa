# Costa Community

De community voor huiseigenaren in Spanje: forum, ledendirectory,
marktplaats en nieuws/evenementen.

## Status

Dit is de eerste opzet (MVP-scaffold): een Next.js-app met de vier
kernonderdelen, gevuld met voorbeelddata (`src/lib/data.ts`) zodat de site
direct werkt en bekeken kan worden. Er is nog geen database, login of
formulierverwerking aangesloten.

Alvast voorbereid voor de volgende fase:
- `prisma/schema.prisma` bevat het datamodel (User, ForumPost, Listing,
  Article, Event) voor wanneer er een echte Postgres-database wordt
  aangesloten.
- `.env.example` toont de `DATABASE_URL` die dan nodig is.

## Ontwikkelen

```bash
npm install
npm run dev
```

De site draait dan op http://localhost:3000.

## Deployen naar Railway

Railway detecteert dit project automatisch als Next.js-app (via Nixpacks);
`railway.json` legt de build/start-commando's expliciet vast.

1. Log in op [railway.app](https://railway.app) en maak een nieuw project.
2. Kies "Deploy from GitHub repo" en selecteer deze repository
   (`mamsterdam12/Costa`), branch `claude/github-deploy-costa-ucsh0z` (of
   `main` na mergen).
3. Railway bouwt automatisch met `npm run build` en start met
   `npm run start`.
4. Zodra er een database wordt toegevoegd (Railway Postgres-plugin), zet de
   verbindingsstring als env var `DATABASE_URL` in het Railway-project.

> Let op: dit account/deze sessie heeft geen toegang tot Railway zelf, dus
> het daadwerkelijk aanmaken van het Railway-project en koppelen van de
> GitHub-repo moet je zelf doen via het Railway-dashboard. De code hierboven
> is er klaar voor.

## Volgende stappen

- Authenticatie voor leden (bijv. NextAuth) zodat profielen, topics en
  listings door leden zelf beheerd kunnen worden.
- Prisma + Postgres aansluiten en de mock-data in `src/lib/data.ts`
  vervangen door echte database-queries.
- Formulieren voor nieuwe forumtopics, reacties en marktplaats-aanmeldingen.
