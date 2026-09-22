import { slugify } from "./html";

// Picking an entry's own URL out of a listing. Themes disagree about
// where the link sits -- wrapped around the card, on the title, in a
// "read more" after it -- but they agree on one thing: the URL of an
// event's page tends to echo the event's own name. That travels between
// sites far better than a per-site path pattern, and it never attaches
// a neighbouring entry's URL to this one.

// Words long enough to identify one entry rather than any page on the
// site ("agenda", "marbella", "2026" would match everything).
const STOPWORDS = new Set([
  "agenda", "index", "event", "events", "evento", "eventos",
  "marbella", "turismo", "whats", "page", "home",
]);

export function distinctiveWords(text: string): string[] {
  return slugify(text)
    .split("-")
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

export function collectHrefs(slice: string, into: string[] = []): string[] {
  for (const m of slice.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = m[1].trim();
    if (!href || /^(javascript|mailto|tel):/i.test(href)) continue;
    if (!into.includes(href)) into.push(href);
  }
  return into;
}

/** The candidate whose URL echoes the most of the title's own words. */
export function pickByTitle(candidates: string[], title: string): string | null {
  const words = distinctiveWords(title);
  if (!words.length) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const href of candidates) {
    const hrefWords = new Set(slugify(href).split("-"));
    const score = words.filter((w) => hrefWords.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = href;
    }
  }
  return best;
}
