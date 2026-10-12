import { dayAndMonth, weekdayLong, weekdayShort } from "@/domain/dates";
import { formatAmount } from "@/domain/shopping-list/format";
import type { ViewLine } from "@/domain/shopping-list/present";
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

/** When something that does not keep has to be bought: "bis Sonntag, 18. Oktober". */
export function neededText(view: ViewLine): string {
  const day = view.line.neededBy;
  return day ? `für ${weekdayLong(day)}, ${dayAndMonth(day)}` : "";
}
