import { addDays, isIsoDate, mondayOf } from "@/domain/dates";
import { isCheckedField } from "@/domain/library/quality";

/**
 * Where a recipe was opened from. Its page leads back there: someone who tapped a meal on
 * the week plan wants the plan again, not the library.
 */
export interface Origin {
  href: string;
  label: string;
}

const LIBRARY: Origin = { href: "/rezepte", label: "Entdecken" };

/**
 * What a link to a recipe adds to its address when it stands on the week plan: the week, the
 * day it stands on, which the way back lands on when it cannot step back, and how much of it
 * the meal cooks, which its page starts with.
 */
export function fromPlan(week: string, day?: string, servings?: number): string {
  return `?von=woche&w=${week}${day ? `&tag=${day}` : ""}${servings ? `&portionen=${servings}` : ""}`;
}

/** What a link to a recipe adds to its address when it stands among the favourites. */
export const FROM_FAVORITES = "?von=favoriten";

/**
 * What a link to a recipe adds to its address when it stands among the fields to check,
 * with the field the list is narrowed to.
 */
export function fromFieldChecks(field: string | null): string {
  return `?von=angaben${field ? `&feld=${field}` : ""}`;
}

/** What a link to a recipe adds to its address when it stands among the steps to check. */
export const FROM_STEP_CHECKS = "?von=schritte";

/** What a link to a recipe adds to its address when it stands in the Regal. */
export const FROM_SHELF = "?von=regal";

/** What a link to a recipe adds to its address when it stands in the statistics. */
export const FROM_STATISTICS = "?von=statistik";

/** What a link to a recipe adds to its address when it stands among the duplicates. */
export const FROM_DUPLICATES = "?von=doppelt";

const RECIPE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads where a recipe page was opened from out of its address. Anything it does not know
 * is the library, so nothing in an address can make the link lead anywhere else. Back on
 * the fields to check, the list scrolls to the recipe (`recipeId`) under the same filter;
 * back on the week, the plan scrolls to the day (`day`).
 */
export function readOrigin(
  von: string | undefined,
  week: string | undefined,
  { recipeId, field, day }: { recipeId?: string; field?: string; day?: string } = {},
): Origin {
  if (von === "favoriten") return { href: "/favoriten", label: "Favoriten" };
  if (von === "angaben") {
    const filter = field && isCheckedField(field) ? `?feld=${field}` : "";
    const anchor = recipeId && RECIPE_ID.test(recipeId) ? `#r-${recipeId}` : "";
    return { href: `/import/pruefen/angaben${filter}${anchor}`, label: "Angaben prüfen" };
  }
  if (von === "regal") {
    const anchor = recipeId && RECIPE_ID.test(recipeId) ? `#r-${recipeId}` : "";
    return { href: `/rezepte/regal${anchor}`, label: "Regal" };
  }
  if (von === "statistik") return { href: "/woche/statistik", label: "Statistik" };
  if (von === "doppelt") return { href: "/import/pruefen/doppelt", label: "Doppelte Rezepte" };
  if (von === "schritte") {
    const anchor = recipeId && RECIPE_ID.test(recipeId) ? `#r-${recipeId}` : "";
    return { href: `/import/pruefen/schritte${anchor}`, label: "Arbeitsschritte prüfen" };
  }
  if (von === "woche") {
    const known = week !== undefined && isIsoDate(week) && mondayOf(week) === week;
    // Back on the day the recipe stands on, where that is a day of the week.
    const onDay =
      known && day !== undefined && isIsoDate(day) && day >= week && day <= addDays(week, 6);
    return {
      href: known ? `/woche?w=${week}${onDay ? `#tag-${day}` : ""}` : "/woche",
      label: "Wochenplan",
    };
  }
  return LIBRARY;
}
