import type { ScrapedEvent } from "../types";
import { absoluteUrl, slugify, stripTags } from "./html";
import { marbellaTimeToUtc, startOfTodayInMarbella } from "../../lib/datetime";

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

function firstHref(html: string, pageUrl: string): string | null {
  for (const m of html.matchAll(/<a[^>]*href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) continue;
    return absoluteUrl(href, pageUrl);
  }
  return null;
}

export type JetCalendarResult = {
  events: ScrapedEvent[];
  /** False when the month/year had to be guessed from today's date. */
  datesExplicit: boolean;
  label: string;
};

export function parseJetCalendar(html: string, pageUrl: string): JetCalendarResult {
  const grid = blocks(html, "jet-calendar-grid")[0];
  if (!grid) return { events: [], datesExplicit: false, label: "no jet-calendar-grid" };

  const { month, year, explicit } = detectMonthYear(grid);
  const notBefore = startOfTodayInMarbella().getTime();
  const events: ScrapedEvent[] = [];

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
      if (startsAt.getTime() < notBefore) continue;

      const href = firstHref(block, pageUrl);
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
    datesExplicit: explicit,
    label: `${year}-${String(month).padStart(2, "0")}${explicit ? "" : " (month/year guessed)"}`,
  };
}
