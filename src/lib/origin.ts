import { isIsoDate, mondayOf } from "@/domain/dates";

/**
 * Where a recipe was opened from. Its page leads back there: someone who tapped a meal on
 * the week plan wants the plan again, not the library.
 */
export interface Origin {
  href: string;
  label: string;
}

const LIBRARY: Origin = { href: "/rezepte", label: "Entdecken" };

/** What a link to a recipe adds to its address when it stands on the week plan. */
export function fromPlan(week: string): string {
  return `?von=woche&w=${week}`;
}

/** What a link to a recipe adds to its address when it stands among the favourites. */
export const FROM_FAVORITES = "?von=favoriten";

/**
 * Reads where a recipe page was opened from out of its address. Anything it does not know
 * is the library, so nothing in an address can make the link lead anywhere else.
 */
export function readOrigin(von: string | undefined, week: string | undefined): Origin {
  if (von === "favoriten") return { href: "/favoriten", label: "Favoriten" };
  if (von === "woche") {
    const known = week !== undefined && isIsoDate(week) && mondayOf(week) === week;
    return { href: known ? `/woche?w=${week}` : "/woche", label: "Wochenplan" };
  }
  return LIBRARY;
}
