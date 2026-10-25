import {
  addDays,
  isIsoDate,
  isoWeek,
  mondayOf,
  monthAndYear,
  monthOfWeek,
  type IsoDate,
} from "../dates";

/**
 * The span a statistic looks at: a week, a month or a year. A month and a year are made of
 * whole weeks, each counted for the month most of its days are in, as "Alle Wochen" counts
 * them. So the weekly goals stay whole weeks, and a week is never split across two months.
 */

export type PeriodKind = "week" | "month" | "year";
export const PERIOD_KINDS: readonly PeriodKind[] = ["week", "month", "year"];

export interface Period {
  kind: PeriodKind;
  /** "2026-10-19" for a week, "2026-10" for a month, "2026" for a year. */
  key: string;
  /** The Monday of its first week and the Sunday of its last. */
  start: IsoDate;
  end: IsoDate;
  /** The Mondays of its weeks, in order. */
  weeks: IsoDate[];
}

/** A bar of a chart over time: a week of a month, a month of a year, a week before a week. */
export interface Bucket {
  key: string;
  /** "KW 43", "Okt". */
  label: string;
  start: IsoDate;
  end: IsoDate;
  /** The period a tap on the bar opens. */
  opens: { kind: PeriodKind; key: string };
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

/** The Mondays of the weeks that count for a month ("2026-10"). */
function weeksOfMonth(month: string): IsoDate[] {
  // The first week of a month has its Thursday in it: it starts at most three days before.
  let monday = mondayOf(addDays(`${month}-01`, 3));
  const weeks: IsoDate[] = [];
  while (monthOfWeek(monday) <= month) {
    if (monthOfWeek(monday) === month) weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return weeks;
}

function monthsOfYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, at) => `${year}-${String(at + 1).padStart(2, "0")}`);
}

/** The period of one kind a day belongs to. */
export function periodOf(kind: PeriodKind, date: IsoDate): Period {
  const monday = mondayOf(date);
  if (kind === "week") return makePeriod("week", monday, [monday]);
  const month = monthOfWeek(monday);
  if (kind === "month") return makePeriod("month", month, weeksOfMonth(month));
  const year = month.slice(0, 4);
  return makePeriod("year", year, monthsOfYear(year).flatMap(weeksOfMonth));
}

function makePeriod(kind: PeriodKind, key: string, weeks: IsoDate[]): Period {
  return { kind, key, weeks, start: weeks[0], end: addDays(weeks[weeks.length - 1], 6) };
}

/**
 * The period an address names (`?zeit=monat&am=2026-10`), or the one of today. Anything it
 * cannot read is today's month: the address never leads to nonsense.
 */
export function readPeriod(
  kindText: string | undefined,
  keyText: string | undefined,
  today: IsoDate,
): Period {
  const kind = PERIOD_KINDS.find((entry) => PERIOD_PARAM[entry] === kindText) ?? "month";
  const date = dateOfKey(kind, keyText);
  return periodOf(kind, date ?? today);
}

function dateOfKey(kind: PeriodKind, key: string | undefined): IsoDate | null {
  if (!key) return null;
  if (kind === "week") return isIsoDate(key) ? key : null;
  if (kind === "month") {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(key) ? addDays(`${key}-01`, 14) : null;
  }
  return /^\d{4}$/.test(key) ? `${key}-07-01` : null;
}

/** How a kind of period is written in the address. */
export const PERIOD_PARAM: Record<PeriodKind, string> = {
  week: "woche",
  month: "monat",
  year: "jahr",
};

/** The period before or after. */
export function shiftPeriod(period: Period, step: -1 | 1): Period {
  if (period.kind === "week") return periodOf("week", addDays(period.start, 7 * step));
  if (period.kind === "month") {
    return periodOf("month", step < 0 ? addDays(period.start, -1) : addDays(period.end, 1));
  }
  return periodOf("year", `${Number(period.key) + step}-07-01`);
}

/**
 * Whether there is anything to look at before a period: not before the week the household
 * started with the app.
 */
export function hasPeriodBefore(period: Period, firstWeek: IsoDate | null): boolean {
  return firstWeek === null || period.start > firstWeek;
}

/** Whether a period lies after today's: nothing has happened there yet. */
export function hasPeriodAfter(period: Period, today: IsoDate): boolean {
  return period.end < today;
}

/** The days of a period that have happened, and the household had the app on. */
export function daysCounted(
  period: Period,
  today: IsoDate,
  firstWeek: IsoDate | null,
): { from: IsoDate; to: IsoDate } | null {
  const from = firstWeek !== null && firstWeek > period.start ? firstWeek : period.start;
  const to = period.end < today ? period.end : today;
  return from <= to ? { from, to } : null;
}

/** The weeks of a period that have begun, and are not before the household's first. */
export function weeksCounted(period: Period, today: IsoDate, firstWeek: IsoDate | null): IsoDate[] {
  return period.weeks.filter((week) => week <= today && (firstWeek === null || week >= firstWeek));
}

/** "Oktober 2026", "2026", "KW 43". */
export function periodTitle(period: Period): string {
  if (period.kind === "month") return monthAndYear(period.key);
  if (period.kind === "year") return period.key;
  return `KW ${isoWeek(period.start)}`;
}

/** "KW 40–44", or for a single week nothing more than its title says. */
export function periodWeeksText(period: Period): string {
  if (period.weeks.length === 1) return `KW ${isoWeek(period.start)}`;
  return `KW ${isoWeek(period.weeks[0])}–${isoWeek(period.weeks[period.weeks.length - 1])}`;
}

/** How many weeks the trend before a single week shows. */
export const WEEKS_OF_TREND = 8;

/**
 * The bars of a chart over time: the weeks of a month, the months of a year, and for a week
 * the weeks up to it. Nothing after today's period and nothing before the household's first
 * week: an empty bar there would read as a week without meals.
 */
export function bucketsOf(period: Period, today: IsoDate, firstWeek: IsoDate | null): Bucket[] {
  const week = (monday: IsoDate): Bucket => ({
    key: monday,
    label: `KW ${isoWeek(monday)}`,
    start: monday,
    end: addDays(monday, 6),
    opens: { kind: "week", key: monday },
  });
  const all =
    period.kind === "year"
      ? monthsOfYear(period.key)
          .map((month) => ({ month, weeks: weeksOfMonth(month) }))
          .map(({ month, weeks }): Bucket => ({
            key: month,
            label: SHORT_MONTHS[Number(month.slice(5)) - 1],
            start: weeks[0],
            end: addDays(weeks[weeks.length - 1], 6),
            opens: { kind: "month", key: month },
          }))
      : period.kind === "month"
        ? period.weeks.map(week)
        : Array.from({ length: WEEKS_OF_TREND }, (_, at) =>
            week(addDays(period.start, -7 * (WEEKS_OF_TREND - 1 - at))),
          );
  return all.filter(
    (bucket) => bucket.start <= today && (firstWeek === null || bucket.end >= firstWeek),
  );
}
