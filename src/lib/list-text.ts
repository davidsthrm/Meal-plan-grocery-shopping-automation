import { dayAndMonth, weekdayLong, weekdayShort, type IsoDate } from "@/domain/dates";
import { formatAmount } from "@/domain/shopping-list/format";
import type { AisleView, ViewLine } from "@/domain/shopping-list/present";
import type { ShoppingKind, ShoppingTrip } from "@/domain/shopping-list/trips";
import type { Contribution } from "@/domain/shopping-list/types";
import { MEAL_NAME } from "./plan-text";

/** The words of the shopping list that screen, paper and PDF share. */

/** Why a line is on the list: the meal and recipe, or that someone typed it. */
export function sourceText(contribution: Contribution): string {
  const { source } = contribution;
  switch (source.type) {
    case "recipe":
      return `${weekdayShort(source.date)} ${MEAL_NAME[source.meal]}: ${source.recipeTitle}`;
    case "extra":
      return `Außerdem: ${source.recipeTitle}`;
    case "food":
      return `${weekdayShort(source.date)} ${MEAL_NAME[source.meal]}: ${source.mealLabel}`;
    case "manual":
      return "von Hand eingetragen";
  }
}

/** The exact amounts behind a line, where the list itself shows a rounded one or none. */
export function exactText(view: ViewLine): string {
  const amounts = view.line.amounts.map(formatAmount);
  if (view.line.hasUnquantified && amounts.length > 0) amounts.push("und ohne Mengenangabe");
  return amounts.join(" + ");
}

/** Where the household shops on a day. */
export const KIND_NAME: Record<ShoppingKind, string> = {
  all: "Supermarkt",
  market: "Markt & Metzger",
};

/** A shopping day as the heading of its list: "Montag, 12. Oktober". */
export function dayTitle(trip: Pick<ShoppingTrip, "date">): string {
  return `${weekdayLong(trip.date)}, ${dayAndMonth(trip.date)}`;
}

/** The meals a list buys for: "für Montag bis Donnerstag". Empty for a list of typed lines. */
export function coversText(view: AisleView): string {
  const days: IsoDate[] = [...view.groups.flatMap((group) => group.lines), ...view.later]
    .flatMap((entry) => entry.line.contributions)
    .flatMap(({ source }) =>
      source.type === "recipe" || source.type === "food" ? [source.date] : [],
    )
    .sort();
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  return first === last
    ? `für ${weekdayLong(first)}`
    : `für ${weekdayLong(first)} bis ${weekdayLong(last)}`;
}

/** When something that is bought shortly before has to be there: "für Sonntag, 18. Oktober". */
export function neededText(view: ViewLine): string {
  const day = view.line.neededBy;
  return day ? `für ${weekdayLong(day)}, ${dayAndMonth(day)}` : "";
}
