export type DateFilter = "today" | "tomorrow" | "weekend" | "week" | "month";

export const dateFilterLabels: Record<DateFilter, Record<string, string>> = {
  today: { nl: "Vandaag", en: "Today", es: "Hoy" },
  tomorrow: { nl: "Morgen", en: "Tomorrow", es: "Mañana" },
  weekend: { nl: "Dit weekend", en: "This weekend", es: "Este fin de semana" },
  week: { nl: "Deze week", en: "This week", es: "Esta semana" },
  month: { nl: "Deze maand", en: "This month", es: "Este mes" },
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Returns the [from, to) window for a given quick filter, anchored on "now".
export function dateFilterRange(filter: DateFilter, now = new Date()): [Date, Date] {
  const today = startOfDay(now);

  switch (filter) {
    case "today":
      return [today, addDays(today, 1)];
    case "tomorrow":
      return [addDays(today, 1), addDays(today, 2)];
    case "weekend": {
      const day = today.getDay(); // 0 = Sunday
      const daysUntilSaturday = (6 - day + 7) % 7;
      const saturday = addDays(today, daysUntilSaturday);
      return [saturday, addDays(saturday, 2)];
    }
    case "week":
      return [today, addDays(today, 7)];
    case "month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return [start, end];
    }
  }
}
