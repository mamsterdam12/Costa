import type { ScrapedEvent } from "../types";
import { absoluteUrl, slugify, stripTags } from "./html";
import { marbellaTimeToUtc } from "../../lib/datetime";
import { collectHrefs, pickByTitle } from "./links";

// Parser for JetEngine's (Crocoblock) "Listing Calendar" Elementor
// widget -- a month grid of `jet-calendar-week__day` cells, each with a
// day number and zero or more event blocks. No JSON-LD, no <time>, no
// REST API: the dates only exist as the calendar's own month/year plus
// the day number in each cell, which is why the generic tiers found
// nothing on thefarm-marbella.com.

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Slices the document at every element carrying `token` as a whole class. */
function blocks(html: string, token: string): string[] {
  const re = new RegExp(`<[a-z][a-z0-9]*[^>]*class=["'][^"']*\\b${token}(?![\\w-])[^"']*["'][^>]*>`, "gi");
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) starts.push(m.index);
  return starts.map((s, i) => html.slice(s, i + 1 < starts.length ? starts[i + 1] : html.length));
}

function firstBlockText(html: string, token: string): string {
  return stripTags(blocks(html, token)[0] ?? "");
}

function detectMonthYear(html: string): { month: number; year: number; explicit: boolean } {
  const selected = [...html.matchAll(/<option[^>]*\sselected[^>]*>([\s\S]*?)<\/option>/gi)].map((m) =>
    stripTags(m[1]).trim()
  );
  let month = selected.map((o) => MONTHS.indexOf(o.toLowerCase())).find((i) => i >= 0);
  let year = selected.map((o) => Number(o)).find((n) => n >= 2000 && n <= 2100);

  if (month === undefined || year === undefined) {
    const caption = firstBlockText(html, "jet-calendar-caption__name");
    month ??= MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b`, "i").test(caption));
    if (month < 0) month = undefined;
    year ??= Number(/\b(20\d{2})\b/.exec(caption)?.[1]);
    if (!year) year = undefined;
  }

  const now = new Date();
  return {
    month: (month ?? now.getUTCMonth()) + 1,
    year: year ?? now.getUTCFullYear(),
    // Guessing the month from "today" would silently file events under the
    // wrong dates, so the caller downgrades to DRAFT when that happens.
    explicit: month !== undefined && year !== undefined,
  };
}

// "From 7.30PM" / "from 7 PM" / "19:30" -> {hour, minute}
function parseTime(text: string): { hour: number; minute: number } | null {
  const ampm = /(\d{1,2})(?:[.:h](\d{2}))?\s*([ap])\.?m\.?/i.exec(text);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "p") hour += 12;
    return { hour, minute: Number(ampm[2] ?? 0) };
  }
  const h24 = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/.exec(text);
  if (h24) return { hour: Number(h24[1]), minute: Number(h24[2]) };
  return null;
}

// Without a real DOM the block slices run on into the next element, so a
// link far down is as likely to belong to the neighbour as to this
// event. Two ways to be sure it doesn't: a URL echoing this event's own
// title, from anywhere in the block, or the very first link in it.
function eventHref(block: string, title: string): { href: string | null; candidates: string[] } {
  const candidates = collectHrefs(block.slice(0, 2500));
  const byTitle = pickByTitle(candidates, title);
  if (byTitle) return { href: byTitle, candidates };
  const near = collectHrefs(block.slice(0, 600));
  return { href: near[0] ?? null, candidates };
}

// Elementor ships a per-entry <style> block ahead of the entry's own
// markup -- thousands of characters of generated CSS. Left in, it fills
// any window big enough to hold the entry and hides the link that comes
// after it, which is why The Farm's events all pointed at the listing.
function withoutAssets(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

export type JetCalendarResult = {
  events: ScrapedEvent[];
  /** Hrefs seen inside the first event block, for when none was usable. */
  linkCandidates: string[];
  /** Raw markup of the first entry, logged when nothing linked at all. */
  entrySample: string;
  /** False when the month/year had to be guessed from today's date. */
  datesExplicit: boolean;
  label: string;
};

export function parseJetCalendar(html: string, pageUrl: string): JetCalendarResult {
  const grid = blocks(html, "jet-calendar-grid")[0];
  if (!grid) {
    return { events: [], datesExplicit: false, label: "no jet-calendar-grid", linkCandidates: [], entrySample: "" };
  }

  const { month, year, explicit } = detectMonthYear(grid);
  const events: ScrapedEvent[] = [];
  let linkCandidates: string[] = [];
  let entrySample = "";

  for (const cell of blocks(grid, "jet-calendar-week__day")) {
    // Cells padding out the first/last week belong to adjacent months.
    if (/class=["'][^"']*\bday-pad\b/i.test(cell.slice(0, 400))) continue;

    const day = Number(firstBlockText(cell, "jet-calendar-week__day-date").trim().split(/\s/)[0]);
    if (!day || day < 1 || day > 31) continue;

    // The same event renders twice per cell (grid + mobile overlay).
    const seen = new Set<string>();
    for (const block of blocks(cell, "jet-calendar-week__day-event")) {
      const lines = stripTags(block).split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      const key = lines.join("|").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const title = lines[0];
      const rest = lines.slice(1);
      const time = parseTime(rest.join(" ")) ?? parseTime(title) ?? { hour: 0, minute: 0 };
      const startsAt = marbellaTimeToUtc(year, month, day, time.hour, time.minute);
      const markup = withoutAssets(block);
      const link = eventHref(markup, title);
      const href = link.href ? absoluteUrl(link.href, pageUrl) : null;
      if (!linkCandidates.length) linkCandidates = link.candidates.slice(0, 6);
      if (!entrySample) entrySample = markup.slice(0, 700);
      const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      events.push({
        externalId: href ?? `${pageUrl}#${slugify(title)}-${dayKey}`,
        title,
        description: rest.join(" · "),
        startsAt,
        sourceUrl: href ?? pageUrl,
        costType: "UNKNOWN",
      });
    }
  }

  return {
    events,
    linkCandidates,
    entrySample,
    datesExplicit: explicit,
    label: `${year}-${String(month).padStart(2, "0")}${explicit ? "" : " (month/year guessed)"}`,
  };
}
