import type { ScrapedEvent } from "../types";
import { absoluteUrl, slugify, stripTags } from "./html";
import { parseDateRange } from "./dates";
import { collectHrefs, pickByTitle } from "./links";

// YOOtheme Pro (the page builder behind a great many Joomla and
// WordPress sites, including turismo.marbella.es) renders each listing
// entry as the same three elements:
//
//   <div class="el-meta ...">…28 Mayo 2026 - 15 Noviembre 2026</div>
//   <div class="el-title ..."><span>Dalí - Diez recetas…</span></div>
//   <div class="el-content ...">Exposiciones</div>
//
// There are no <time> elements, no JSON-LD and no event-ish class names,
// which is why every generic tier missed it. Keying on this trio is
// specific enough to be safe and general enough to serve any other
// YOOtheme site we register later.

// Tag-aware: the closing tag has to match the opening one, or a stray
// el-title heading swallows everything up to the next </div>.
const TITLE = /<(div|h[1-6]|span|a)\b[^>]*class=["'][^"']*\bel-title\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;

// The text of the element whose class name contains `token`. The match
// lands inside the class attribute, so the element's own text starts
// after the tag closes -- otherwise the rest of the attribute list ends
// up in the value.
function elementText(slice: string, at: number): string | null {
  const open = slice.indexOf(">", at);
  if (open < 0) return null;
  const rest = slice.slice(open + 1);
  const close = rest.indexOf("</div>");
  return stripTags(close >= 0 ? rest.slice(0, close) : rest);
}

function nearestBefore(html: string, end: number, token: string, window = 1500): string | null {
  const from = Math.max(0, end - window);
  const slice = html.slice(from, end);
  const at = slice.lastIndexOf(token);
  return at < 0 ? null : elementText(slice, at);
}

function nearestAfter(html: string, start: number, token: string, window = 1200): string | null {
  const slice = html.slice(start, start + window);
  const at = slice.indexOf(token);
  return at < 0 ? null : elementText(slice, at);
}

// An entry's own page. The card is usually wrapped in a link, but its
// shape differs per site, so the surest signal is the URL echoing the
// title's own words; a path pattern is the fallback. A wrong URL is
// worse than none, so anything matching neither is ignored.
export function entryLink(
  html: string,
  end: number,
  title: string,
  detailPath: RegExp,
  window = 3000
): { href: string | null; candidates: string[] } {
  // Themes differ on where the link sits: wrapped around the whole card
  // (before the title) or as a "read more" after it. Look both ways, but
  // stop before the next entry so its link can't be borrowed.
  const before = html.slice(Math.max(0, end - window), end);
  const ahead = html.slice(end, end + window);
  const nextEntry = ahead.search(/\bel-title\b/);
  const after = nextEntry < 0 ? ahead : ahead.slice(0, nextEntry);

  const backward = collectHrefs(before);
  const candidates = collectHrefs(after, [...backward]);

  const best = pickByTitle(candidates, title);
  if (best) return { href: best, candidates };

  // Nothing echoed the title: fall back to the nearest link that at
  // least looks like a detail page, and only from the card itself.
  const byPath = backward.filter((h) => detailPath.test(h));
  return { href: byPath.length ? byPath[byPath.length - 1] : null, candidates };
}

export type UikitListingResult = {
  events: ScrapedEvent[];
  /** Entries found but dropped because their date wouldn't parse. */
  undated: number;
  /** Entries stored without their own URL. */
  unlinked: number;
  /** Hrefs seen around the first entry -- so a run that links nothing
   *  still shows in the log what the page actually offered. */
  linkCandidates: string[];
};

export function parseUikitListing(
  html: string,
  pageUrl: string,
  detailPath = /\/(agenda|evento|event)s?\//i
): UikitListingResult {
  const events: ScrapedEvent[] = [];
  const byKey = new Map<string, number>();
  let undated = 0;
  let linkCandidates: string[] = [];

  TITLE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TITLE.exec(html))) {
    const title = stripTags(m[2]).trim();
    if (!title) continue;

    const meta = nearestBefore(html, m.index, "el-meta");
    const range = meta ? parseDateRange(meta) : null;
    if (!range) {
      undated++;
      continue;
    }

    const after = m.index + m[0].length;
    const link = entryLink(html, after, title, detailPath);
    if (!linkCandidates.length) linkCandidates = link.candidates.slice(-6);
    const sourceUrl = link.href ? absoluteUrl(link.href, pageUrl) : pageUrl;
    const description = nearestAfter(html, after, "el-content")?.trim() ?? "";

    const event: ScrapedEvent = {
      externalId: link.href ? sourceUrl : `${pageUrl}#${slugify(title)}`,
      title,
      description,
      startsAt: range.start,
      endsAt: range.end,
      sourceUrl,
      costType: "UNKNOWN",
    };

    // The same entry usually appears twice -- once in a sidebar teaser,
    // once in the listing proper. Keep the richer of the two rather than
    // whichever came first: the teaser rarely carries the link.
    const key = `${slugify(title)}|${range.start.toISOString()}`;
    const seen = byKey.get(key);
    if (seen === undefined) {
      byKey.set(key, events.length);
      events.push(event);
      continue;
    }
    const kept = events[seen];
    const better =
      (link.href ? 2 : 0) + (description ? 1 : 0) >
      (kept.sourceUrl !== pageUrl ? 2 : 0) + (kept.description ? 1 : 0);
    if (better) events[seen] = event;
  }

  return { events, undated, unlinked: events.filter((e) => e.sourceUrl === pageUrl).length, linkCandidates };
}
