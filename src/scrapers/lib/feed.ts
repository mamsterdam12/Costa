import type { ScrapedEvent } from "../types";
import { absoluteUrl, decodeEntities, slugify, stripTags } from "./html";
import { parseDateRange } from "./dates";

// RSS/Atom. A feed is smaller than the page it belongs to, survives
// redesigns, and hands you the per-item URL for free -- so when a source
// publishes one it's the better thing to read.
//
// The catch: a feed's own date is when the item was *published*, which
// for an events feed is not when the event happens. So an item only
// becomes an event if a date can be read out of its title or summary;
// otherwise it's skipped rather than filed under the wrong day.

export function findFeedUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) urls.push(absoluteUrl(decodeEntities(href), pageUrl));
  }
  return [...new Set(urls)];
}

function tagText(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!m) return null;
  const raw = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return stripTags(raw).trim();
}

function itemLink(xml: string, base: string): string | null {
  const plain = tagText(xml, "link");
  if (plain) return absoluteUrl(plain, base);
  // Atom puts the URL in an attribute instead.
  const href = /<link\b[^>]*href=["']([^"']+)["']/i.exec(xml)?.[1];
  return href ? absoluteUrl(decodeEntities(href), base) : null;
}

export type FeedResult = {
  events: ScrapedEvent[];
  items: number;
  /** Items skipped because no event date could be read from them. */
  undated: number;
};

export function parseFeed(xml: string, feedUrl: string): FeedResult {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const events: ScrapedEvent[] = [];
  let undated = 0;

  for (const block of blocks) {
    const title = tagText(block, "title");
    if (!title) continue;
    const summary =
      tagText(block, "description") ?? tagText(block, "summary") ?? tagText(block, "content") ?? "";

    // Deliberately not pubDate/published: that's when it was posted.
    const range = parseDateRange(title) ?? parseDateRange(summary.slice(0, 400));
    if (!range) {
      undated++;
      continue;
    }

    const link = itemLink(block, feedUrl);
    events.push({
      externalId: link ?? `${feedUrl}#${slugify(title)}`,
      title,
      description: summary,
      startsAt: range.start,
      endsAt: range.end,
      sourceUrl: link ?? feedUrl,
      costType: "UNKNOWN",
    });
  }

  return { events, items: blocks.length, undated };
}
