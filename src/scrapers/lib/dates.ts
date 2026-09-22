import { marbellaTimeToUtc } from "../../lib/datetime";

// Listings write dates for people, not machines: "28 Mayo 2026 - 15
// Noviembre 2026", "26 Sep 2026", "13 okt 2026 20:00". This turns those
// into instants, in Spanish local time, for any source on the coast.

const MONTHS: Record<string, number> = {};
const register = (index: number, ...names: string[]) => {
  for (const n of names) MONTHS[n] = index;
};
register(1, "enero", "ene", "january", "jan", "januari", "januar");
register(2, "febrero", "feb", "february", "februari", "februar");
register(3, "marzo", "mar", "march", "maart", "märz", "mrt");
register(4, "abril", "abr", "april", "apr");
register(5, "mayo", "may", "mei", "mai");
register(6, "junio", "jun", "june", "juni");
register(7, "julio", "jul", "july", "juli");
register(8, "agosto", "ago", "august", "aug", "augustus");
register(9, "septiembre", "setiembre", "sept", "sep", "september", "septembre");
register(10, "octubre", "oct", "october", "okt", "oktober", "octobre");
register(11, "noviembre", "nov", "november");
register(12, "diciembre", "dic", "december", "dec");

const MONTH_PATTERN = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

// "28 Mayo 2026", "28 de mayo de 2026", "28/05/2026", "2026-05-28"
const DAY_MONTH_YEAR = new RegExp(
  String.raw`(\d{1,2})\s*(?:de\s+)?(${MONTH_PATTERN})\.?\s*(?:de\s+)?(\d{4})?`,
  "i"
);
const NUMERIC = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})|(\d{4})-(\d{2})-(\d{2})/;
const TIME = /(?:a\s+las\s+)?\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/i;

export type DateRange = { start: Date; end?: Date };

function buildDate(day: number, month: number, year: number, text: string): Date | null {
  if (!day || !month || !year || day > 31 || month > 12) return null;
  const t = TIME.exec(text);
  return marbellaTimeToUtc(year, month, day, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
}

function parseOne(text: string, fallbackYear?: number): Date | null {
  const numeric = NUMERIC.exec(text);
  if (numeric) {
    return numeric[1]
      ? buildDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]), text)
      : buildDate(Number(numeric[6]), Number(numeric[5]), Number(numeric[4]), text);
  }
  const m = DAY_MONTH_YEAR.exec(text);
  if (!m) return null;
  const year = m[3] ? Number(m[3]) : fallbackYear;
  if (!year) return null;
  return buildDate(Number(m[1]), MONTHS[m[2].toLowerCase()], year, text);
}

// Splits on the dash that separates two dates -- not on the hyphens
// inside a date or a title.
export function parseDateRange(raw: string): DateRange | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const parts = text.split(/\s+[-–—]\s+|\s+(?:hasta|until|t\/m|tot)\s+/i);
  if (parts.length >= 2) {
    // "28 Mayo - 15 Noviembre 2026": only the second part carries the year.
    const endYear = /(\d{4})/.exec(parts[1])?.[1];
    const start = parseOne(parts[0], endYear ? Number(endYear) : undefined);
    const end = parseOne(parts[1], start ? start.getUTCFullYear() : undefined);
    if (start) {
      // Some listings have the range backwards; an end before the start
      // is data we can't trust, so keep only what we're sure of.
      return { start, end: end && end.getTime() > start.getTime() ? end : undefined };
    }
  }
  const start = parseOne(text);
  return start ? { start } : null;
}

// "From 7.30PM", "20:00", "20.00 h", "a las 20:00 h" -> wall-clock time.
// Listings and detail pages write it every one of these ways.
export function parseTimeOfDay(text: string): { hour: number; minute: number } | null {
  const ampm = /(\d{1,2})(?:[.:h](\d{2}))?\s*([ap])\.?\s?m\.?/i.exec(text);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "p") hour += 12;
    return { hour, minute: Number(ampm[2] ?? 0) };
  }
  const h24 = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/.exec(text);
  if (h24) return { hour: Number(h24[1]), minute: Number(h24[2]) };
  // "a las 20 h", "20 h" -- an hour on its own only counts when the page
  // marks it as one, or every price and house number becomes a time.
  const bare = /\b([01]?\d|2[0-3])\s*(?:h\b|horas\b|uur\b)/i.exec(text);
  if (bare) return { hour: Number(bare[1]), minute: 0 };
  return null;
}

/** The same instant, moved to a given wall-clock time in Marbella. */
export function atTimeInMarbella(day: Date, time: { hour: number; minute: number }): Date {
  const p: Record<string, number> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(day)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return marbellaTimeToUtc(p.year, p.month, p.day, time.hour, time.minute);
}
