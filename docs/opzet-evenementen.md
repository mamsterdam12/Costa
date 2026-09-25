# Opzet: hoe evenementen de database in komen

Status: ontwerp, vastgesteld in overleg. Er is hiervoor nog geen code geschreven
of gewijzigd. Dit stuk beschrijft wat er gebouwd gaat worden en waarom, zodat de
afwegingen later terug te lezen zijn.

De cijfers in dit document komen uit echte runs op onze twee bestaande bronnen
(turismo.marbella.es en thefarm-marbella.com), niet uit schattingen.

---

## 1. Uitgangspunten

1. **Niets verzinnen.** Een veld is leeg, of het staat in de bron. Dat geldt voor
   prijzen, tijden, adressen en foto's, en het geldt net zo hard voor een agent
   als voor een script.
2. **Bronnen worden met rust gelaten.** Eén opgeslagen kopie per pagina, hergebruikt
   door alles wat erna komt. Geen CAPTCHA's omzeilen, robots.txt respecteren, en
   een weigering geldt meteen voor de hele site.
3. **Wat elke run opnieuw gebeurt, moet gratis zijn.** AI zetten we in bij ontdekken
   en repareren — niet als vaste kostenpost per pagina per dag.
4. **Onvolledig is niet hetzelfde als kapot.** 17 van onze 23 stadsevents noemen
   nergens een aanvangstijd. Dat is de bron, niet ons script.

---

## 2. De vier lagen

### Laag 1 — Ontdekken (dagelijks, goedkope agent)

Zoekt nieuwe bronnen, maximaal **30 per dag** om te beginnen. Volgt vanaf
aggregators (Eventbrite, My Guide Marbella) de verwijzingen naar losse events, en
haalt daar de organisator of locatie uit. Niet het aggregator-event wordt de bron,
maar de **agendapagina van die locatie** — die gaat jaren mee.

Elke vondst krijgt een triage op één vraag: overzichtspagina met meerdere events,
losse eventpagina, of geen van beide? Die triage draait op de uitgeklede tekst
(~15 KB), niet op de ruwe HTML (de stadspagina is 377 KB).

Een nieuwe bron mag **zichzelf bewijzen**: levert de eerste oogst minstens drie
events op met titel, datum en gemeente, zonder afgevallen velden, dan gaat hij
automatisch live. Anders komt hij in de wachtrij met de bewaarde pagina erbij.

### Laag 2 — Oogsten (dagelijks, zonder AI)

Per bron, in deze volgorde:

0. **Is de pagina veranderd?** ETag/Last-Modified uit de snapshot-opslag. Onveranderd
   → klaar. Nul verzoeken, nul tokens. Dit is de belangrijkste kostenknop.
1. **De gedeelde ladder.** JSON-LD → YOOtheme-listing → The Events Calendar API →
   RSS/Atom → JetEngine-kalender → dated headings, plus de detailpagina-lezer.
   Twee totaal verschillende sites draaien hier nu op zonder één regel
   bronspecifieke code.
2. Lukt dat niet, of ontbreken er verplichte velden → laag 3.

### Laag 3 — Lezen met een agent (op trigger, goedkoop)

Krijgt de uitgeklede pagina plus het **aanwijzingendocument** van deze bron.
Levert events met per veld een waarde. Schrijft nooit zelf tekst.

### Laag 4 — Beoordelen (wekelijks, slimme agent)

Kijkt naar de opgeslagen data naast de bewaarde pagina en beslist per bron:
aanwijzingendocument bijwerken · pagina opnieuw vastleggen · bron pauzeren ·
bron voordragen om offline te gaan.

De kernvraag die alleen deze laag kan beantwoorden: **ontbreekt het op de pagina,
of lezen wij het niet?**

### Waarom niet: een script per bron

Overwogen en afgevallen als standaard. Scripts zijn goedkoper en controleerbaarder,
maar tussen "bron gevonden" en "events op de site" staat dan altijd een dure agent
die code schrijft, en honderd kleine venue-sites veranderen voortdurend van thema.

Wat we er wél uit overnemen: **een bron die stabiel is, verdient code.** Blijft een
aanwijzingendocument een aantal runs ongewijzigd, dan maakt de slimme agent er een
ladder-recept van. Die bron valt dan terug naar laag 2 en kost niets meer.

---

## 3. Taakverdeling: gedeeld versus bronspecifiek

> De bronspecifieke laag beantwoordt één vraag: **welke events staan op deze pagina,
> en wat zegt de pagina over elk?**

Al het andere hoort bij de gedeelde schrijflaag: identiteit, ontdubbelen,
categoriseren, tijdzone, foto's, archiveren, publicatiebeslissing.

Dit is niet theoretisch. Precies daar ging het mis toen `externalId` veranderde van
overzichts- naar detail-URL (21 dubbele rijen), en toen een event van middernacht
naar 20:00 verschoof en een tweede rij kreeg.

---

## 4. Bewijsplicht per veld

Elke waarde die een agent teruggeeft, moet terug te vinden zijn in de opgehaalde
pagina. De schrijflaag controleert dat zelf, vlak voor het wegschrijven.

| Veld | Controle |
|---|---|
| Titel, locatie, adres | Komt de tekst zo voor op de pagina |
| Prijs | Bedrag of woord ("gratis", "entrada libre") staat er echt |
| Datum en tijd | Genormaliseerd herleidbaar tot wat er staat ("26 Sep 2026", "20.00 h") |
| Eigen URL, ticketlink | Komt als link in de pagina voor |
| Foto | Afbeeldings-URL komt in de pagina voor |
| Omschrijving | De agent wijst tekst van de bron aan, schrijft niet zelf |
| Gemeente, kern | De naam, alias of postcode waaruit ze zijn afgeleid staat op de pagina — óf de gemeente komt uit de broninstelling (zie §6) |

Faalt de controle, dan gaat dát veld niet mee; het event meestal wel. Elke
afvaller wordt geteld, zodat laag 4 ziet of een bron structureel afvallers heeft
(dan hoort er een vertaalregel in het aanwijzingendocument, bijvoorbeeld
"M.G.E.C. = Museo del Grabado Español Contemporáneo").

**Bewijsopslag.** Per gevuld veld bewaren we de snapshot en het letterlijke
fragment. Over een half jaar is "waar komt dit adres vandaan?" dan te beantwoorden
met een citaat en een datum, ook als de pagina intussen gewijzigd is.

De prijs die we hiervoor betalen: soms valt een terecht antwoord af omdat de
pagina het anders verwoordt. Dat is de goede kant om op te falen.

---

## 5. Veldenschema

### Zonder dit bestaat het event niet

Titel · datum · regio · brontaal. De laatste twee komen uit de bronconfiguratie.

### Publicatiepoort

Een event is pas zichtbaar met:

> **titel · datum · gemeente · omschrijving (≥40 tekens) · eigen URL van het event**

De omschrijving mag niet gelijk zijn aan de titel of aan een categorienaam —
anders haalt het woord "Exposiciones" de drempel zonder iets te zeggen.

Ontbreekt er iets, dan wordt het event **wel opgeslagen, als concept**: onzichtbaar
op de site, zichtbaar in het dashboard, en het werk van de slimme agent. Zo
verdwijnt er niets stilletjes en hoeven we de pagina niet eindeloos opnieuw op te
halen.

### Optioneel, blokkeert nooit

Aanvangstijd (met vlag of de bron hem noemde) · einddatum · kern (Nomenclátor) ·
locatie (vrije tekst) · adres · prijs (vrije tekst, inclusief wat de bron er verder
bij zet) · foto · organisator · ticketlink.

### Van ons, niet van de bron

Categorie · slug · status · dubbel-van-markering · bron-id en extern id · laatst
gezien · tijdstempels · foto-afmetingen · bewijsfragmenten.

### Wat dit met de huidige 26 events doet

| Verplicht gesteld | Verlies |
|---|---|
| Titel + datum | 0 |
| + gemeente | 0 (via broninstelling) |
| + eigen URL | 0 |
| + omschrijving ≥40 | een handvol naar concept |
| *(niet verplicht)* aanvangstijd | zou 14 kosten |
| *(niet verplicht)* prijs | zou 17 kosten |

### Vervalt

`recurrenceRule` — we genereren nooit zelf een reeks, dus het veld blijft altijd
leeg en zet later iemand op het verkeerde been. Elke voorstelling is een eigen rij;
The Farm's wekelijkse flamenco kan per keer uitvallen.

---

## 6. Plaats: gemeente, kern, locatie

Drie dingen die vaak verward worden:

| Veld | Type | Voorbeeld |
|---|---|---|
| **Gemeente** | verwijzing, verplicht | Marbella |
| **Kern** (Nomenclátor) | verwijzing, optioneel | San Pedro de Alcántara |
| **Locatie** | vrije tekst, optioneel | "Playa de la Fontanilla", "The Farm Marbella" |
| **Adres** | vrije tekst, optioneel | "Pl. Altamirano 3, 29601" |

Weergave: `Marbella` of `Marbella, San Pedro de Alcántara`. Locatie is niet
verplicht: wie meer wil weten, klikt door naar de bron.

### Hoe de gemeente gevuld wordt

1. **Van de pagina** — gemeentenaam, alias, of een postcode die naar precies één
   gemeente leidt.
2. **Van de bron** — de gemeente die bij die bron is ingesteld. Een vaste locatie
   staat op één plek; dat is een menselijke vaststelling, geen modeluitkomst.

Welke van de twee het was, leggen we per event vast. Wat een agent níét mag: een
gemeente afleiden uit wat hij "weet" over een venue. Staat het nergens en is de
bron niet plaatsgebonden (een aggregator), dan blijft de gemeente leeg en gaat het
event naar concept.

De kern wordt alleen gevuld als hij op de bronpagina genoemd wordt.

### De valkuil: gelijknamige plaatsen

Spanje heeft tientallen kernen die "La Cala", "El Pinar" of "Santa María" heten.
Daarom: eerst zoeken binnen de gemeente van de bron, dan binnen de provincie, en
pas landelijk als de match uniek is. Niet uniek → kern blijft leeg. Een lege kern
kost niets, een verkeerde kost vertrouwen.

### Gemeente is niet hetzelfde als regio

Regio is een sectie van de site, gemeente is een feit over het event. Een regio
wordt een verzameling gemeentes. Vandaag: regio Marbella = gemeente Marbella.
Later kan daar Benahavís bij, of een regio "Costa del Sol Occidental" met
Estepona, Mijas en Fuengirola, zonder één event aan te raken.

Bijvangst: events uit gemeentes die we nog niet tonen, kunnen gewoon binnenkomen.
Zodra je een regio opent, staat er al agenda.

---

## 7. Categorieën

Drie tabellen: **groepen → categorieën → events**, waarbij een event alleen zijn
categorie kent. Herschikken van het menu raakt dan geen enkel event, en filterlinks
blijven werken omdat die de categorie-slug gebruiken.

| Groep | Categorieën |
|---|---|
| Muziek & uitgaan | Concerten & live muziek · Uitgaan & nachtleven |
| Cultuur | Kunst & exposities · Theater, dans & film · Fiestas & tradities |
| Actief | Sport & buiten · Rondleidingen & excursies · Wellness & gezondheid · Cursussen & workshops |
| Eten & kopen | Eten & drinken · Markten & shopping |
| Samen | Familie & kinderen |

Eén categorie per event. Drie categorieën staan vandaag leeg (markten, cursussen,
wellness); zijn ze over een paar maanden nog leeg, dan was het een categorie die
wij wilden en niet een die bestaat.

### Toekennen, in deze volgorde

1. **De bronterm.** De stadsagenda publiceert zijn eigen woorden bij elk event —
   *Exposiciones, Conciertos, Teatro, Festivales, Deportivos, Benéficos, Generales,
   Ferias y Congresos*. Betrouwbaarder dan raden op titelwoorden. De term zelf
   bewaren we ongewijzigd bij het event.
2. **Trefwoordregels** op titel en tekst, als er geen bronterm is.
3. **De standaard van de bron.**

De brontermtabel is meertalig en kent drie soorten regels: term → categorie, term →
niets-zeggend (gebruik de gewone regels), en onbekend → één regeltje in de wachtrij
("*Ferias y Congresos* — welke categorie?"). Eén klik, en het systeem weet het
voorgoed.

Welke term of regel de categorie bepaalde, leggen we vast.

### Geen categorie: eigenschappen van een event

Vuistregel: **zegt het wát voor evenement het is → categorie; zegt het iets óver
het evenement → eigenschap.** Een tapasroute voor het goede doel is nog steeds een
tapasroute. De bestemming van het geld krijgt dus geen veld, geen label en geen
filter; staat het in de prijsregel van de bron, dan staat het gewoon in de
prijstekst.

---

## 8. Ontdubbelen

**Binnen een bron:** een event is dezelfde rij bij zelfde bron + zelfde dag +
zelfde genormaliseerde titel, ook als zijn externe id of zijn tijdstip verandert.
Dat laatste is geen theorie: het gebeurde twee keer in één week.

**Tussen bronnen:** zelfde dag + zelfde gemeente + vergelijkbare titel, met locatie
als extra bevestiging als beide events er een hebben. Gemeente is er altijd, dus de
sleutel is altijd compleet. Categorie doet niet mee — die is van ons en twee bronnen
kunnen hem verschillend krijgen.

Een dubbele wordt **gemarkeerd, nooit samengevoegd of verwijderd**: beide rijen
houden hun id, de publieke pagina's tonen alleen het origineel.

**Verdwenen events** worden gearchiveerd, niet gewist: een toekomstig event van deze
bron dat een geslaagde run niet zag, verdwijnt van de site maar houdt zijn rij, en
komt vanzelf terug als de bron hem weer noemt.

---

## 9. Foto's als apart proces

Een eigen werker over alle events zonder foto, los van het oogsten:

- werkt uit de bewaarde pagina (geen nieuw bezoek aan de bron)
- zoekt de poster, controleert de afmetingen uit de header-bytes (minimaal 200px;
  zo vielen 60×60-thumbnails en spacers eruit), slaat op in onze bucket, legt de
  herkomst vast
- publicatie wacht nergens op; zonder foto een categorie-achtergrond

Een verzonnen foto bij een echt evenement is net zo misleidend als een verzonnen
prijs.

---

## 10. Vertalingen

Ongewijzigd: de brontekst is canoniek, vertaling is een aparte gecachete laag, en de
vertaler voegt niets toe. Een vertaling is nooit de bron van een feit.

---

## 11. Wie beslist wat

| Handeling | Wie |
|---|---|
| Bron pauzeren (stoppen met nieuwe events, bestaande laten staan) | agent, omkeerbaar |
| Aanwijzingendocument schrijven of bijwerken | agent |
| Nieuwe bron live zetten na geslaagd zelfbewijs | automatisch |
| Bron definitief offline | beheerder |
| Oogst vrijgeven die door de verschilpoort tegengehouden is | beheerder |
| Twijfelachtige nieuwe bron goedkeuren | beheerder |
| Onbekende bronterm aan een categorie koppelen | beheerder |
| Nieuwe plaatsalias goedkeuren | beheerder |

**Verschilpoort:** levert een run ineens veel minder events dan de vorige, of
verandert de helft van de titels, dan gaat de oogst naar review in plaats van de
database in. Zo wordt een sitewijziging zichtbaar in plaats van stilletjes
destructief.

Ontbrekende velden komen níét in de wachtrij van de beheerder. Dat is werk voor de
slimme agent.

Het dashboard waar dit allemaal langskomt, heeft op dit moment geen enkele
beveiliging. Dat moet er eerst op.

---

## 12. Opzoektabellen

| Tabel | Herkomst | Verplicht in gebruik |
|---|---|---|
| Gemeentes (INE-code, provincie, autonome regio) | open data, seed in de repo, heel Spanje in één keer | ja |
| Nomenclátor (kernen onder een gemeente) | open data, seed, met jaartal | nee |
| Plaatsaliassen | handmatig + voorstellen van de agent | — |
| Categoriegroepen en categorieën | eigen lijst | ja |
| Brontermen → categorie | groeit mee met de bronnen | — |

Aliassen zijn geen luxe: "San Pedro Alcántara" zonder *de*, "Puerto Banús" (een
havengebied, geen officiële kern), accentloze schrijfwijzen en Engelse namen komen
allemaal voor. Zonder die tabel heb je binnen een week vier "gemeentes" die
allemaal Marbella zijn, en klopt de ontdubbeling niet meer.

---

## 13. Kosten

Uitgeklede stadspagina ≈ 6.000 tokens; een detailpagina ≈ 3.000.

| Situatie | Per bron per run | 100 bronnen, dagelijks |
|---|---|---|
| Pagina onveranderd | 0 | valt grotendeels weg |
| Ladder pakt het | 0 | 0 |
| Agent leest het overzicht | ~8k tokens | ~800k tokens/dag |
| Bron is "afgestudeerd" naar een recept | 0 | 0 |

Detailpagina's worden alleen opgehaald voor events die nieuw zijn — een handvol per
bron per week, geen 23 per run.

---

## 14. Openstaande punten

- Beveiliging op het dashboard, voordat er een wachtrij op komt te staan.
- Budget per maand voor de agents; dat bepaalt of ontdekken op 30 bronnen per dag
  blijft staan of omhoog kan.
- Of de eerste twee weken élke nieuwe bron langs de beheerder gaat, voordat het
  zelfbewijs aangezet wordt.
