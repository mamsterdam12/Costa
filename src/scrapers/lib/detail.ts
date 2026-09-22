import type { PageResult } from "./fetcher";
import { absoluteUrl, decodeEntities, stripTags } from "./html";
import { parseTimeOfDay } from "./dates";
import { extractJsonLdEvents } from "./jsonld";
import { pickByTitle } from "./links";

// A listing tells you what is on and when, roughly. Everything else --
// the hour it starts, where it is, what it costs, the poster -- lives on
// the event's own page, which is why those fields came back empty even
// though the source states all of them.
//
// This reads that page generically: the same labelled rows ("Horario",
// "Lugar", "Precio") appear on nearly every event page, in one language
// or another, and og: tags carry the image and the summary. Nothing here
// is specific to one source.

export type EventDetails = {
  time?: { hour: number; minute: number };
  venueName?: string;
  address?: string;
  costType?: "FREE" | "PAID" | "UNKNOWN";
  costAmount?: string;
  description?: string;
  imageUrl?: string;
  /** What was read and what wasn't, for the run log. */
  found: string[];
};

const LABELS = {
  time: ["horario", "hora", "horas", "hora de inicio", "schedule", "time", "tijd", "aanvang", "uur"],
  place: [
    "lugar", "ubicacion", "ubicación", "donde", "dónde", "sitio", "direccion", "dirección",
    "venue", "location", "place", "address", "plaats", "locatie", "adres",
  ],
  price: [
    "precio", "precios", "entrada", "entradas", "coste", "tarifa", "price", "tickets",
    "admission", "cost", "prijs", "toegang", "toegangsprijs",
  ],
} as const;

function metaContent(html: string, names: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!key || !names.includes(key)) continue;
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content?.trim()) return decodeEntities(content.trim());
  }
  return null;
}

// Labelled rows survive as "Label:" followed by its value, whether the
// page puts the two in one element or in two -- which is why this reads
// the stripped text rather than the markup.
function labelledValues(text: string): Map<string, string> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]{2,24}?)\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const label = m[1].trim().toLowerCase();
    const value = (m[2] || lines[i + 1] || "").trim();
    if (value && !out.has(label)) out.set(label, value.slice(0, 300));
  }
  return out;
}

function valueFor(values: Map<string, string>, labels: readonly string[]): string | null {
  for (const [label, value] of values) {
    if (labels.some((l) => label === l || label.startsWith(`${l} `))) return value;
  }
  return null;
}

export function classifyCost(text: string): { costType: "FREE" | "PAID" | "UNKNOWN"; costAmount?: string } {
  if (/\b(gratis|gratuit[ao]?|free|libre|sin coste|entrada libre)\b/i.test(text)) {
    return { costType: "FREE" };
  }
  const amount = /(\d{1,4}(?:[.,]\d{2})?)\s*(?:€|eur(?:os)?)|(?:€|eur(?:os)?)\s*(\d{1,4}(?:[.,]\d{2})?)/i.exec(text);
  if (amount) return { costType: "PAID", costAmount: text.slice(0, 120) };
  return { costType: "UNKNOWN" };
}

// The event's own picture, never the site's logo: og:image if the page
// declares one, otherwise an <img> whose file name echoes the title.
function eventImage(html: string, pageUrl: string, title: string): string | null {
  const meta = metaContent(html, ["og:image", "og:image:secure_url", "twitter:image"]);
  if (meta) return absoluteUrl(meta, pageUrl);
  const srcs: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)) {
    const src = decodeEntities(m[1]);
    if (/logo|icon|avatar|placeholder|spinner|pixel|sprite/i.test(src)) continue;
    if (!srcs.includes(src)) srcs.push(src);
  }
  const byTitle = pickByTitle(srcs, title);
  return byTitle ? absoluteUrl(byTitle, pageUrl) : null;
}

export function extractDetails(page: PageResult, title: string): EventDetails {
  const details: EventDetails = { found: [] };
  const text = stripTags(page.html);
  const values = labelledValues(text);

  // 1. schema.org, when the page has it: unambiguous and already parsed.
  const [jsonLd] = extractJsonLdEvents(page.html, page.url);
  if (jsonLd) {
    details.venueName = jsonLd.venueName;
    details.address = jsonLd.address;
    if (jsonLd.costType && jsonLd.costType !== "UNKNOWN") {
      details.costType = jsonLd.costType;
      details.costAmount = jsonLd.costAmount;
    }
    if (jsonLd.startsAt && !isNaN(jsonLd.startsAt.getTime())) {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false })
          .format(jsonLd.startsAt)
      );
      const minute = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", minute: "2-digit" })
          .format(jsonLd.startsAt)
      );
      if (hour || minute) details.time = { hour, minute };
    }
    details.found.push("json-ld");
  }

  // 2. The labelled rows the page shows its readers.
  const timeRow = valueFor(values, LABELS.time);
  const placeRow = valueFor(values, LABELS.place);
  const priceRow = valueFor(values, LABELS.price);

  details.time ??= (timeRow ? parseTimeOfDay(timeRow) : null) ?? undefined;
  if (placeRow) {
    details.venueName ??= placeRow;
    details.address ??= placeRow;
  }
  if (priceRow && (details.costType ?? "UNKNOWN") === "UNKNOWN") {
    const cost = classifyCost(priceRow);
    if (cost.costType !== "UNKNOWN") {
      details.costType = cost.costType;
      details.costAmount = cost.costType === "PAID" ? (cost.costAmount ?? priceRow) : undefined;
    }
  }
  for (const [label, row] of [["time", timeRow], ["place", placeRow], ["price", priceRow]] as const) {
    if (row) details.found.push(`${label}="${row.slice(0, 60)}"`);
  }

  // 3. The page's own summary and picture.
  const summary = metaContent(page.html, ["og:description", "description", "twitter:description"]);
  if (summary && summary.length > 20) {
    details.description = summary;
    details.found.push("description");
  }
  const image = eventImage(page.html, page.url, title);
  if (image) {
    details.imageUrl = image;
    details.found.push("image");
  }

  return details;
}
