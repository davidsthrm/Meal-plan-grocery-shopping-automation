import type { IsoDate } from "@/domain/dates";

/** Today's date where the household lives. A server in another time zone must not shift it. */
export function today(): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** The hour of the day where the household lives, 0 to 23. */
export function hourNow(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
}
