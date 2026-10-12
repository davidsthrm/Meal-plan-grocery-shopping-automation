import type { IsoDate } from "@/domain/dates";

/** Today's date where the household lives. A server in another time zone must not shift it. */
export function today(): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}
