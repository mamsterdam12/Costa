import type { ScrapedEvent } from "../types";
import { absoluteUrl, decodeEntities, slugify, stripTags } from "./html";

type JsonLdNode = Record<string, unknown>;

// Pulls every schema.org Event (MusicEvent, FoodEvent, ...) out of the
// <script type="application/ld+json"> blocks on a page. This is the most
// reliable thing to scrape: most WordPress event calendars emit it, and
// it's structured, so no guessing at the page's HTML layout is needed.
export function extractJsonLdEvents(html: string, pageUrl: string): ScrapedEvent[] {
  const nodes: JsonLdNode[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      collect(JSON.parse(m[1].trim()), nodes);
    } catch {
      // Malformed block -- skip, another block may still be fine.
    }
  }

  const events: ScrapedEvent[] = [];
  for (const node of nodes) {
    if (!isEvent(node)) continue;
    const ev = toScrapedEvent(node, pageUrl);
    if (ev) events.push(ev);
  }
  return events;
}

function collect(value: unknown, out: JsonLdNode[]) {
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out);
  } else if (value && typeof value === "object") {
    const node = value as JsonLdNode;
    out.push(node);
    if (Array.isArray(node["@graph"])) collect(node["@graph"], out);
  }
}

function isEvent(node: JsonLdNode): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && /Event$/.test(t));
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "@value" in value) {
    return asString((value as JsonLdNode)["@value"]);
  }
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  const s = asString(value);
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function toScrapedEvent(node: JsonLdNode, pageUrl: string): ScrapedEvent | null {
  // WordPress tends to HTML-encode names even inside JSON-LD ("&amp;").
  const title = decodeEntities(asString(node.name) ?? "").trim();
  const startsAt = parseDate(node.startDate);
  if (!title || !startsAt) return null;

  const url = asString(node.url) || asString(node["@id"]);
  const sourceUrl = url ? absoluteUrl(url, pageUrl) : pageUrl;
  // Without a detail URL, key on the listing page + title so two such
  // events on one page don't collide (startsAt is also in the DB key).
  const externalId = url ? sourceUrl : `${pageUrl}#${slugify(title)}`;

  const location = node.location as JsonLdNode | JsonLdNode[] | string | undefined;
  const place = Array.isArray(location) ? location[0] : location;
  let venueName: string | undefined;
  let address: string | undefined;
  if (typeof place === "string") {
    venueName = decodeEntities(place);
  } else if (place && typeof place === "object") {
    venueName = asString(place.name) ? decodeEntities(asString(place.name)!) : undefined;
    const addr = place.address;
    if (typeof addr === "string") address = addr;
    else if (addr && typeof addr === "object") {
      const a = addr as JsonLdNode;
      address = [a.streetAddress, a.postalCode, a.addressLocality]
        .map(asString)
        .filter(Boolean)
        .join(", ");
    }
  }

  const { costType, costAmount } = parseOffers(node);

  return {
    externalId,
    title,
    description: stripTags(asString(node.description) ?? ""),
    startsAt,
    endsAt: parseDate(node.endDate),
    venueName,
    address: address || undefined,
    sourceUrl,
    costType,
    costAmount,
  };
}

function parseOffers(node: JsonLdNode): { costType: ScrapedEvent["costType"]; costAmount?: string } {
  if (node.isAccessibleForFree === true) return { costType: "FREE" };
  const offers = node.offers;
  const offer = (Array.isArray(offers) ? offers[0] : offers) as JsonLdNode | undefined;
  if (!offer || typeof offer !== "object") return { costType: "UNKNOWN" };
  const price = asString(offer.price) ?? asString(offer.lowPrice);
  if (price === undefined) return { costType: "UNKNOWN" };
  const n = Number(price);
  if (!isNaN(n) && n === 0) return { costType: "FREE" };
  const currency = asString(offer.priceCurrency) ?? "";
  const high = asString(offer.highPrice);
  const amount = high && high !== price ? `${price}–${high} ${currency}` : `${price} ${currency}`;
  return { costType: "PAID", costAmount: amount.trim() };
}
