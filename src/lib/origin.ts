import { isIsoDate, mondayOf } from "@/domain/dates";
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

/** What a link to a recipe adds to its address when it stands on the week plan. */
export function fromPlan(week: string): string {
  return `?von=woche&w=${week}`;
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

/** What a link to a recipe adds to its address when it stands among the duplicates. */
export const FROM_DUPLICATES = "?von=doppelt";

const RECIPE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads where a recipe page was opened from out of its address. Anything it does not know
 * is the library, so nothing in an address can make the link lead anywhere else. Back on
 * the fields to check, the list scrolls to the recipe (`recipeId`) under the same filter.
 */
export function readOrigin(
  von: string | undefined,
  week: string | undefined,
  { recipeId, field }: { recipeId?: string; field?: string } = {},
): Origin {
  if (von === "favoriten") return { href: "/favoriten", label: "Favoriten" };
  if (von === "angaben") {
    const filter = field && isCheckedField(field) ? `?feld=${field}` : "";
    const anchor = recipeId && RECIPE_ID.test(recipeId) ? `#r-${recipeId}` : "";
    return { href: `/import/pruefen/angaben${filter}${anchor}`, label: "Angaben prüfen" };
  }
  if (von === "doppelt") return { href: "/import/pruefen/doppelt", label: "Doppelte Rezepte" };
  if (von === "schritte") {
    const anchor = recipeId && RECIPE_ID.test(recipeId) ? `#r-${recipeId}` : "";
    return { href: `/import/pruefen/schritte${anchor}`, label: "Arbeitsschritte prüfen" };
  }
  if (von === "woche") {
    const known = week !== undefined && isIsoDate(week) && mondayOf(week) === week;
    return { href: known ? `/woche?w=${week}` : "/woche", label: "Wochenplan" };
  }
  return LIBRARY;
}
