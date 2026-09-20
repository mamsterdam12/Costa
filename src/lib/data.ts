export type ForumPost = {
  id: string;
  title: string;
  category: string;
  author: string;
  region: string;
  replies: number;
  lastActivity: string;
  excerpt: string;
  body: string;
};

export type Member = {
  id: string;
  name: string;
  region: string;
  province: string;
  since: string;
  bio: string;
  tags: string[];
};

export type Listing = {
  id: string;
  name: string;
  category: string;
  region: string;
  description: string;
  contact: string;
  rating: number;
};

export type Article = {
  id: string;
  title: string;
  date: string;
  summary: string;
  content: string;
};

export type CommunityEvent = {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
};

export const forumPosts: ForumPost[] = [
  {
    id: "nie-belasting-2026",
    title: "Wijzigingen NIE-belasting 2026 — wat merken jullie?",
    category: "Belasting & regelgeving",
    author: "HenkVanDijk",
    region: "Costa Blanca",
    replies: 24,
    lastActivity: "2 uur geleden",
    excerpt: "De nieuwe aangifteregels voor niet-residenten gaan per januari in. Iemand al ervaring met de nieuwe formulieren?",
    body: "De nieuwe aangifteregels voor niet-residenten gaan per januari in. Iemand al ervaring met de nieuwe formulieren? Onze gestora zegt dat het proces dit jaar volledig digitaal moet via de nieuwe portal. Benieuwd of anderen hier al mee te maken hebben gehad en welke documenten je klaar moet hebben liggen.",
  },
  {
    id: "zwembad-onderhoud",
    title: "Betrouwbare zwembadonderhoud in de regio Marbella?",
    category: "Klussen & onderhoud",
    author: "AnneKoster",
    region: "Costa del Sol",
    replies: 11,
    lastActivity: "5 uur geleden",
    excerpt: "Ons huidige bedrijf stopt ermee. Wie kan een goede, betaalbare zwembadservice aanraden rond Marbella/Estepona?",
    body: "Ons huidige bedrijf stopt ermee. Wie kan een goede, betaalbare zwembadservice aanraden rond Marbella/Estepona? Het gaat om wekelijks onderhoud van een middelgroot buitenzwembad, incl. chemicaliën.",
  },
  {
    id: "internet-glasvezel",
    title: "Glasvezel eindelijk beschikbaar in onze urbanisatie",
    category: "Wonen & voorzieningen",
    author: "PietBakker",
    region: "Costa Blanca",
    replies: 8,
    lastActivity: "1 dag geleden",
    excerpt: "Na jaren wachten ligt er nu glasvezel in onze straat bij Javea. Providers en snelheden gedeeld in de thread.",
    body: "Na jaren wachten ligt er nu glasvezel in onze straat bij Javea. Providers en snelheden gedeeld in de thread. Wie heeft er al ervaring met de lokale aanbieders?",
  },
  {
    id: "gemeenschapskosten",
    title: "Gemeenschapskosten (comunidad) fors gestegen, is dat normaal?",
    category: "Belasting & regelgeving",
    author: "MartaSimons",
    region: "Costa Blanca",
    replies: 19,
    lastActivity: "3 dagen geleden",
    excerpt: "Onze comunidad-bijdrage steeg met 30%. Is dat gebruikelijk of kunnen we dit als vergadering aanvechten?",
    body: "Onze comunidad-bijdrage steeg met 30%. Is dat gebruikelijk of kunnen we dit als vergadering aanvechten? Wie heeft hier ervaring mee binnen zijn eigen urbanisatie?",
  },
];

export const members: Member[] = [
  {
    id: "henk-van-dijk",
    name: "Henk van Dijk",
    region: "Javea",
    province: "Alicante",
    since: "2019",
    bio: "Sinds 2019 permanent woonachtig aan de Costa Blanca. Voormalig ondernemer, houdt van zeilen en wijn.",
    tags: ["Permanent resident", "Zeilen"],
  },
  {
    id: "anne-koster",
    name: "Anne Koster",
    region: "Estepona",
    province: "Málaga",
    since: "2021",
    bio: "Werkt remote vanuit haar appartement in Estepona. Actief in de lokale expat-tennisclub.",
    tags: ["Remote werken", "Tennis"],
  },
  {
    id: "piet-bakker",
    name: "Piet Bakker",
    region: "Javea",
    province: "Alicante",
    since: "2015",
    bio: "Gepensioneerd, brengt half het jaar door in Spanje. Vrijwilliger bij de lokale dierenbescherming.",
    tags: ["Seizoensbewoner", "Vrijwilligerswerk"],
  },
  {
    id: "marta-simons",
    name: "Marta Simons",
    region: "Torrevieja",
    province: "Alicante",
    since: "2022",
    bio: "Recent verhuisd samen met haar gezin. Zoekt aansluiting bij andere gezinnen met schoolgaande kinderen.",
    tags: ["Gezin", "Nieuwkomer"],
  },
];

export const listings: Listing[] = [
  {
    id: "poolservice-costa",
    name: "PoolService Costa",
    category: "Zwembadonderhoud",
    region: "Costa del Sol",
    description: "Wekelijks onderhoud, reparaties en renovatie van zwembaden. Nederlandstalige service.",
    contact: "info@poolservicecosta.example",
    rating: 4.8,
  },
  {
    id: "gestoria-del-mar",
    name: "Gestoría del Mar",
    category: "Belastingadvies & administratie",
    region: "Costa Blanca",
    description: "NIE-aanvragen, belastingaangiftes en juridische begeleiding voor buitenlandse huiseigenaren.",
    contact: "contact@gestoriadelmar.example",
    rating: 4.9,
  },
  {
    id: "handyman-javea",
    name: "Handyman Javea",
    category: "Klussen & onderhoud",
    region: "Costa Blanca",
    description: "Kleine en grote klussen, van kraan repareren tot volledige renovaties.",
    contact: "handyman.javea@example.com",
    rating: 4.6,
  },
  {
    id: "sunset-realty",
    name: "Sunset Realty",
    category: "Makelaardij",
    region: "Costa del Sol",
    description: "Aan- en verkoop van woningen, gespecialiseerd in internationale koäers.",
    contact: "hello@sunsetrealty.example",
    rating: 4.7,
  },
];

export const articles: Article[] = [
  {
    id: "belastingwijzigingen-2026",
    title: "Belastingwijzigingen 2026 voor buitenlandse huiseigenaren",
    date: "12 september 2026",
    summary: "Een overzicht van de belangrijkste veranderingen in de Spaanse belastingwetgeving die huiseigenaren raken.",
    content: "Een overzicht van de belangrijkste veranderingen in de Spaanse belastingwetgeving die huiseigenaren raken, inclusief de nieuwe digitale aangifteprocedure en gewijzigde tarieven voor niet-residenten.",
  },
  {
    id: "energielabel-verplicht",
    title: "Energielabel verplicht bij verhuur — dit moet je weten",
    date: "3 september 2026",
    summary: "Vanaf dit jaar gelden strengere regels rond energielabels bij verhuur van vakantiewoningen.",
    content: "Vanaf dit jaar gelden strengere regels rond energielabels bij verhuur van vakantiewoningen. We zetten de verplichtingen en boetes op een rij.",
  },
];

export const events: CommunityEvent[] = [
  {
    id: "borrel-javea-oktober",
    title: "Herfstborrel Javea",
    date: "10 oktober 2026, 18:00",
    location: "Beach Bar El Faro, Javea",
    description: "Informele meet-up voor leden uit de regio Costa Blanca Noord. Iedereen welkom!",
  },
  {
    id: "infoavond-belasting",
    title: "Infoavond: belastingaangifte als niet-resident",
    date: "22 oktober 2026, 19:30",
    location: "Online (link volgt na aanmelding)",
    description: "Een lokale gestoría licht de nieuwe regels toe en beantwoordt vragen.",
  },
  {
    id: "wandelgroep-marbella",
    title: "Maandelijkse wandeling Marbella",
    date: "1 november 2026, 09:00",
    location: "Parque de la Alameda, Marbella",
    description: "Vaste wandelgroep voor leden uit de regio Costa del Sol.",
  },
];
