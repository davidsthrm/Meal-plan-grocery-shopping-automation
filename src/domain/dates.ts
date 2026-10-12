/** Calendar dates are ISO strings ("2026-10-12"). No time zones are involved anywhere. */
export type IsoDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`not an ISO date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday: 1 for Monday to 7 for Sunday. */
export function isoWeekday(date: IsoDate): number {
  return new Date(toUtc(date)).getUTCDay() || 7;
}

/** The Monday of the week a date lies in. Weeks run from Monday to Sunday. */
export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

/** The seven days of the week that starts on `monday`. */
export function weekDates(monday: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * The week someone opening the planner most likely wants. The household plans on the weekend
 * for the week ahead, so from Saturday on that is the coming week.
 */
export function planningWeek(today: IsoDate): IsoDate {
  const monday = mondayOf(today);
  return isoWeekday(today) >= 6 ? addDays(monday, 7) : monday;
}

/** True for a string that is a real calendar date in ISO form. */
export function isIsoDate(text: string): text is IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const WEEKDAYS_LONG = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
] as const;
const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

export function weekdayLong(date: IsoDate): string {
  return WEEKDAYS_LONG[new Date(toUtc(date)).getUTCDay()];
}

/** "14. Oktober" */
export function dayAndMonth(date: IsoDate): string {
  const day = new Date(toUtc(date));
  return `${day.getUTCDate()}. ${MONTHS[day.getUTCMonth()]}`;
}

/** The span of a week as a heading: "12.–18. Oktober" or "28. September – 4. Oktober". */
export function weekRange(monday: IsoDate): string {
  const sunday = addDays(monday, 6);
  if (monday.slice(0, 7) === sunday.slice(0, 7)) {
    return `${new Date(toUtc(monday)).getUTCDate()}.–${dayAndMonth(sunday)}`;
  }
  return `${dayAndMonth(monday)} – ${dayAndMonth(sunday)}`;
}

/** German short weekday as written on the plan: "Mo", "Di", ... */
export function weekdayShort(date: IsoDate): string {
  return WEEKDAYS_SHORT[new Date(toUtc(date)).getUTCDay()];
}
