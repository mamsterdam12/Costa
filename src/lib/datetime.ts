// Everything this platform shows is local to the Spanish coast, but the
// server runs in UTC -- so formatting without an explicit time zone made
// a 19:30 flamenco show render as 17:30. All display formatting and all
// scraped wall-clock times go through here.
export const MARBELLA_TZ = "Europe/Madrid";

export function formatInMarbella(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: MARBELLA_TZ }).format(date);
}

// For timestamps in ops views (last scraped, deployment time).
export function formatStamp(date: Date, locale: string): string {
  return formatInMarbella(date, locale, { dateStyle: "short", timeStyle: "medium" });
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p: Record<string, number> = {};
  for (const { type, value } of parts) if (type !== "literal") p[type] = Number(value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - utcMs;
}

// A scraped calendar gives wall-clock time ("Fri 25 Sept, from 7PM") with
// no zone; that's Spanish local time. Converting needs the offset that
// applied *on that date* (CET vs CEST), so this resolves iteratively.
export function marbellaTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall;
  for (let i = 0; i < 2; i++) utc = wall - zoneOffsetMs(utc, MARBELLA_TZ);
  return new Date(utc);
}

// Midnight tonight in Marbella, as an instant -- for "is this in the past".
export function startOfTodayInMarbella(now = new Date()): Date {
  const p: Record<string, number> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-US", {
    timeZone: MARBELLA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return marbellaTimeToUtc(p.year, p.month, p.day, 0, 0);
}

// The calendar day an instant falls on in Marbella, as YYYY-MM-DD. The
// UTC day is a day early for anything before 01:00 local, which is how
// a 28 May event ended up with "2026-05-27" in its slug.
export function marbellaDay(date: Date): string {
  return formatInMarbella(date, "en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}
