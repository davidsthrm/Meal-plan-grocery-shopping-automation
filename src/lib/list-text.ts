import { dayAndMonth, weekdayLong, weekdayShort, type IsoDate } from "@/domain/dates";
import type { DayProblem } from "@/domain/shopping-list/change-day";
import { formatAmount } from "@/domain/shopping-list/format";
import type { AisleView, ViewLine } from "@/domain/shopping-list/present";
import type { Place } from "@/domain/catalog";
import type { Pictogram } from "@/domain/library/pictogram";
import type { ShoppingTrip } from "@/domain/shopping-list/trips";
import { dayOf, type Contribution } from "@/domain/shopping-list/types";
import { MEAL_NAME } from "./plan-text";

/** The words of the shopping list that screen, paper and PDF share. */

/** Why a line is on the list: the meal and recipe, or that someone typed it. */
export function sourceText(contribution: Contribution): string {
  const { source } = contribution;
  switch (source.type) {
    case "recipe":
      return `${weekdayShort(source.date)} ${MEAL_NAME[source.meal]}: ${source.recipeTitle}`;
    case "extra":
      return source.date
        ? `Außerdem, ${weekdayShort(source.date)}: ${source.recipeTitle}`
        : `Außerdem: ${source.recipeTitle}`;
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
  const packs = view.line.packs;
  // What comes in packs says how many that is: "300 ml, das sind 2 Packungen".
  const inPacks =
    packs === null || amounts.length === 0
      ? ""
      : `, das ${packs === 1 ? "ist 1 Packung" : `sind ${packs} Packungen`}`;
  return amounts.join(" + ") + inPacks;
}

/** The places the household shops at. */
export const PLACE_NAME: Record<Place, string> = {
  supermarket: "Supermarkt",
  market: "Markt",
  butcher: "Metzger",
  bakery: "Bäcker",
  drugstore: "dm",
};

/** How a place looks wherever its note shows: its pictogram and the pastel it stands on. */
export const PLACE_LOOK: Record<Place, { pictogram: Pictogram; tone: string }> = {
  supermarket: { pictogram: "wagen", tone: "" },
  market: { pictogram: "korb", tone: "kind-vegetarian" },
  butcher: { pictogram: "fleisch", tone: "kind-red_meat" },
  bakery: { pictogram: "brot", tone: "kind-poultry" },
  drugstore: { pictogram: "flasche", tone: "kind-fish" },
};

/** A day as the heading of a note: "Montag, 12. Oktober". */
export function dayTitle(trip: Pick<ShoppingTrip, "date">): string {
  return `${weekdayLong(trip.date)}, ${dayAndMonth(trip.date)}`;
}

/** When a note is taken along: its day. */
export function whenText(trip: ShoppingTrip): string {
  return dayTitle(trip);
}

/** A note in a few words, for a chip or a file name: "Mo 12. Supermarkt". */
export function noteName(trip: ShoppingTrip): string {
  return `${dayName(trip.date)} ${PLACE_NAME[trip.place]}`;
}

/** A day in a few letters: "Mo 12." */
export function dayName(date: IsoDate): string {
  return `${weekdayShort(date)} ${Number(date.slice(8))}.`;
}

/** The day a line is needed too early for an errand: "Mittwoch", "Mittwochmittag". */
function whenNeeded(problem: Extract<DayProblem, { kind: "too-late" }>): string {
  return `${weekdayLong(problem.neededOn)}${problem.lunch ? "mittag" : ""}`;
}

/** Why an errand cannot be done on another day, as the note says it. */
export function problemText(problem: DayProblem): string {
  switch (problem.kind) {
    case "past":
      return "Der Tag ist schon vorbei.";
    case "too-late":
      return `${problem.label} wird schon am ${whenNeeded(problem)} gebraucht.`;
    case "does-not-keep": {
      const days = problem.shelfLifeDays;
      const keeps =
        days === 0 ? "nicht über Nacht" : days === 1 ? "nur einen Tag" : `nur ${days} Tage`;
      return `${problem.label} hält sich ${keeps} und wird erst am ${weekdayLong(problem.neededOn)} gebraucht.`;
    }
  }
}

/** The meals a list buys for: "für Montag bis Donnerstag". Empty for a list of typed lines. */
export function coversText(view: AisleView): string {
  const days: IsoDate[] = view.groups
    .flatMap((group) => group.lines)
    .flatMap((entry) => entry.line.contributions)
    .flatMap(({ source }) => dayOf(source) ?? [])
    .sort();
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  return first === last
    ? `für ${weekdayLong(first)}`
    : `für ${weekdayLong(first)} bis ${weekdayLong(last)}`;
}

/** When something that is bought shortly before has to be there: "für Do. 15. Oktober". */
export function neededText(view: ViewLine): string {
  const day = view.line.neededBy;
  return day ? `für ${weekdayShort(day)}. ${dayAndMonth(day)}` : "";
}
