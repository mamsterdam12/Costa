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
  /** The event's picture, best guess first. */
  imageUrls: string[];
  /** What was read and what wasn't, for the run log. */
  found: string[];
};

const LABELS = {
  time: ["horario", "hora", "horas", "hora de inicio", "schedule", "time", "tijd", "aanvang", "uur"],
  place: [
    "lugar", "ubicacion", "ubicación", "donde", "dónde", "sitio", "direccion", "dirección",
    "venue", "location", "place", "address", "plaats", "locatie", "adres",
  ],
  street: ["direccion", "dirección", "street", "straat", "adres", "address"],
  postcode: ["codigo postal", "código postal", "cp", "postcode", "zip"],
  town: ["municipio", "localidad", "ciudad", "town", "city", "plaats"],
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

// The event's own picture, never the site's logo and never the 60x60
// thumbnail of a related item. Pages state the size they render an
// image at, and that is what separates the poster from the furniture.
const SMALLEST_POSTER = 200;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}=["']([^"']*)["']`, "i").exec(tag);
  return m ? decodeEntities(m[1]) : null;
}

// srcset lists the same picture at several widths; take the biggest.
function widestFromSrcset(srcset: string): { src: string; width: number } | null {
  let best: { src: string; width: number } | null = null;
  for (const part of srcset.split(",")) {
    const [src, descriptor] = part.trim().split(/\s+/);
    if (!src) continue;
    const width = Number(/^(\d+)w$/.exec(descriptor ?? "")?.[1] ?? 0);
    if (!best || width > best.width) best = { src, width };
  }
  return best;
}

// Returns candidates best-first rather than one answer: a page's og:image
// is sometimes the same 60x60 thumbnail the listing used, and only
// fetching it shows that. The importer walks the list until one is big
// enough to be the event's own picture.
export function eventImages(html: string, pageUrl: string, title: string): string[] {
  const ordered: string[] = [];
  const meta = metaContent(html, ["og:image", "og:image:secure_url", "twitter:image"]);
  if (meta) ordered.push(absoluteUrl(meta, pageUrl));

  const candidates: Array<{ src: string; width: number }> = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const srcset = attr(tag, "srcset");
    const widest = srcset ? widestFromSrcset(srcset) : null;
    const src = widest?.src ?? attr(tag, "src");
    if (!src) continue;
    if (/logo|icon|avatar|placeholder|spinner|pixel|sprite|blank\./i.test(src)) continue;

    // A declared size is the page telling us how big this is meant to
    // be; a thumbnail of a related event says 60.
    const declaredWidth = Number(attr(tag, "width") ?? 0);
    const declaredHeight = Number(attr(tag, "height") ?? 0);
    if (declaredWidth && declaredWidth < SMALLEST_POSTER) continue;
    if (declaredHeight && declaredHeight < SMALLEST_POSTER) continue;

    candidates.push({ src, width: Math.max(widest?.width ?? 0, declaredWidth) });
  }
  const byTitle = pickByTitle(candidates.map((c) => c.src), title);
  if (byTitle) ordered.push(absoluteUrl(byTitle, pageUrl));
  for (const c of [...candidates].sort((a, b) => b.width - a.width)) {
    ordered.push(absoluteUrl(c.src, pageUrl));
  }
  return [...new Set(ordered)].slice(0, 4);
}

// Pages that declare no summary still have one: the longest paragraph
// of real prose on the page, which is the event's own text far more
// often than it is navigation or boilerplate.
function longestParagraph(html: string): string | null {
  let best = "";
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(m[1]).replace(/\s+/g, " ").trim();
    if (text.length > best.length && text.length < 1500 && /[.!?]/.test(text)) best = text;
  }
  return best.length > 60 ? best : null;
}

export function extractDetails(page: PageResult, title: string): EventDetails {
  const details: EventDetails = { imageUrls: [], found: [] };
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
  // Not every page labels the hour; plenty write it in a sentence.
  // Only lines that announce a time are read, so a price or a house
  // number can't become one.
  if (!details.time) {
    for (const line of text.split("\n")) {
      if (!/\b(horario|hora|a las|desde las|apertura|inicio|comienza|doors|starts|from)\b/i.test(line)) {
        continue;
      }
      const time = parseTimeOfDay(line);
      if (time) {
        details.time = time;
        details.found.push(`time in text="${line.trim().slice(0, 60)}"`);
        break;
      }
    }
  }
  if (placeRow) details.venueName ??= placeRow;
  // The city's pages keep the street, the postcode and the town in rows
  // of their own; together they are the address, and "Lugar" is the
  // venue's name, not where it is.
  const street = valueFor(values, LABELS.street);
  const postcode = valueFor(values, LABELS.postcode);
  const town = valueFor(values, LABELS.town);
  const composed = [street, [postcode, town].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  details.address ??= composed || placeRow || undefined;
  if (priceRow && (details.costType ?? "UNKNOWN") === "UNKNOWN") {
    const cost = classifyCost(priceRow);
    if (cost.costType !== "UNKNOWN") {
      details.costType = cost.costType;
      details.costAmount = cost.costType === "PAID" ? (cost.costAmount ?? priceRow) : undefined;
    }
  }
  if (timeRow && details.time) details.found.push(`time="${timeRow.slice(0, 40)}"`);
  if (!details.time && values.size) {
    details.found.push(`labels: ${[...values.keys()].slice(0, 8).join(" | ")}`);
  }
  if (placeRow) details.found.push(`place="${placeRow.slice(0, 40)}"`);
  if (priceRow) details.found.push(`price="${priceRow.slice(0, 40)}"`);

  // 3. The page's own summary and picture.
  const summary =
    metaContent(page.html, ["og:description", "description", "twitter:description"]) ??
    longestParagraph(page.html);
  if (summary && summary.length > 20) {
    details.description = summary;
    details.found.push("description");
  }
  details.imageUrls = eventImages(page.html, page.url, title);
  if (details.imageUrls.length) details.found.push(`${details.imageUrls.length} image candidate(s)`);

  return details;
}
