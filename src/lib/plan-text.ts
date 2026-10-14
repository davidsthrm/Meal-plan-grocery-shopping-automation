import type { Diet } from "@/domain/library/filter";
import type { RecipeKindGroup } from "@/domain/library/grouping";
import type { Meal, PlanSlot } from "@/domain/plan";
import type { ProteinType } from "@/domain/library/summary";
import { groupOf, type BalanceGroup, type BalanceLine } from "@/domain/recommend/balance";
import type { Reason } from "@/domain/recommend/suggest";

/** The words the week plan and the library use, in one place. */

/** Name of the cookie that says this device's user has seen the household's weekly goals. */
export const TARGETS_SEEN = "ziele-gesehen";

export const MEAL_NAME: Record<Meal, string> = {
  lunch: "Mittag",
  coffee: "Kaffee & Kuchen",
  dinner: "Abend",
};
/** The heading over choosing what a meal is. */
export const MEAL_PLAN: Record<Meal, string> = {
  lunch: "Mittagessen planen",
  coffee: "Kaffee & Kuchen planen",
  dinner: "Abendessen planen",
};
/** The heading over adding something to a meal. */
export const MEAL_ADD: Record<Meal, string> = {
  lunch: "Zum Mittagessen dazu",
  coffee: "Zu Kaffee & Kuchen dazu",
  dinner: "Zum Abendessen dazu",
};

export const GROUP_NAME: Record<BalanceGroup, string> = {
  vegetarian: "Vegetarisch",
  fish: "Fisch",
  poultry: "Geflügel",
  red_meat: "Fleisch",
};

/** The name of a group of recipes sorted by kind (`BY_KIND`); null for all the rest. */
export function kindGroupName(key: RecipeKindGroup | null): string {
  if (key === null) return "Sonstiges";
  return key === "sweet" ? "Kuchen & Süßes" : GROUP_NAME[key];
}

/** What counts as which kind of meal, for whoever sets the goals. */
export const GROUP_HINT: Record<BalanceGroup, string> = {
  vegetarian: "ohne Fleisch und Fisch, auch vegan",
  fish: "Fisch und Meeresfrüchte",
  poultry: "Huhn, Pute, Ente",
  red_meat: "Rind, Schwein, Lamm, Wurst",
};

/**
 * How a recipe's kind is marked: the class that sets its colour, and its name. Null for a
 * recipe that is none of the kinds the week counts.
 */
export function kindMark(
  proteinType: ProteinType | null,
): { className: string; label: string } | null {
  const group = groupOf(proteinType);
  if (!group) return null;
  return {
    className: `kind-${group}`,
    label: proteinType === "vegan" ? "Vegan" : GROUP_NAME[group],
  };
}

/** Categories that are sweet: a cake is not shown as a vegetarian meal. */
const SWEET = new Set(["kuchen", "dessert"]);

/**
 * How a recipe is coloured and labelled wherever it shows: by the kind of meal the week
 * counts it as, or as something sweet. Null for a recipe that is neither.
 */
export function recipeTone(recipe: {
  proteinType: ProteinType | null;
  category: string | null;
}): { className: string; label: string | null } | null {
  if (recipe.category !== null && SWEET.has(recipe.category)) {
    return { className: "kind-sweet", label: null };
  }
  return kindMark(recipe.proteinType);
}

const DIET_KIND: Record<Diet, string> = {
  vegetarisch: "kind-vegetarian",
  vegan: "kind-vegetarian",
  fisch: "kind-fish",
  gefluegel: "kind-poultry",
  fleisch: "kind-red_meat",
};

/**
 * The class that colours one way to narrow the library down, where it has a colour of its
 * own: a diet has that of its kind of meal, cakes and desserts are sweet.
 */
export function filterTone(filter: { diet: Diet | null; category: string | null }): string {
  if (filter.diet) return DIET_KIND[filter.diet];
  return filter.category !== null && SWEET.has(filter.category) ? "kind-sweet" : "";
}

export const DIET_NAME: Record<Diet, string> = {
  vegetarisch: "Vegetarisch",
  vegan: "Vegan",
  fisch: "Fisch",
  gefluegel: "Geflügel",
  fleisch: "Fleisch",
};

/** What a week aims for in a group: "mind. 3", "höchstens 2". */
export function targetText(line: BalanceLine): string {
  if (line.min !== null && line.max !== null) return `${line.min} bis ${line.max}`;
  if (line.min !== null) return `mind. ${line.min}`;
  if (line.max !== null) return `höchstens ${line.max}`;
  return "";
}

const weeksText = (weeks: number) => (weeks === 1 ? "einer Woche" : `${weeks} Wochen`);

export function reasonText(reason: Reason): string {
  switch (reason.kind) {
    case "wanted":
      return "Möchtest du kochen";
    case "fills_gap":
      return `${GROUP_NAME[reason.group]} fehlt diese Woche noch`;
    case "favorite":
      return "Favorit";
    case "long_ago":
      return `Zuletzt vor ${weeksText(reason.weeks)} gekocht`;
    case "recent":
      return `Erst vor ${weeksText(reason.weeks)} gekocht`;
    case "group_full":
      return `Schon genug ${GROUP_NAME[reason.group]} diese Woche`;
  }
}

/**
 * Why a recipe is suggested, in one line. A recipe that is there only because the week needs
 * one more meal has no reason, and then nothing is said.
 */
export function whyText(reasons: readonly Reason[]): string {
  return reasons.map(reasonText).join(" · ");
}

/** A planned amount: "4 Personen", "1 Springform (Ø 26 cm)". */
export function plannedText(servings: number, unit: string | null): string {
  if (unit !== null) return `${servings} ${unit}`;
  return servings === 1 ? "1 Person" : `${servings} Personen`;
}

/** What a meal without a recipe says on the plan. */
export function slotText(slot: Exclude<PlanSlot, { kind: "recipes" }>): string {
  switch (slot.kind) {
    case "free_text":
    case "away":
      return slot.label;
    case "leftovers":
      return "Reste";
    case "skipped":
      return "Keiner daheim";
  }
}
