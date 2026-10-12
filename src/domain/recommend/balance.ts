import type { ProteinType, RecipeSummary } from "../library/summary";
import { isMeal } from "../library/summary";
import type { PlanSlot } from "../plan";

/**
 * How a week is balanced: how many of its meals are red meat, poultry, fish or vegetarian,
 * against what the household aims for. No calories, no nutrients: the plan on the fridge
 * door, counted.
 */

export const BALANCE_GROUPS = ["vegetarian", "fish", "poultry", "red_meat"] as const;
export type BalanceGroup = (typeof BALANCE_GROUPS)[number];

/** How many meals of a group a week should have at least and at most. Null for no limit. */
export interface BalanceTarget {
  min: number | null;
  max: number | null;
}
export type BalanceTargets = Record<BalanceGroup, BalanceTarget>;

/** Used until the household sets its own. */
export const DEFAULT_TARGETS: BalanceTargets = {
  vegetarian: { min: 3, max: null },
  fish: { min: 1, max: null },
  poultry: { min: null, max: 2 },
  red_meat: { min: null, max: 2 },
};

export interface BalanceLine extends BalanceTarget {
  group: BalanceGroup;
  count: number;
}

/** A vegan meal is a vegetarian one. A recipe without meat, fish or a clear answer has no group. */
export function groupOf(proteinType: ProteinType | null): BalanceGroup | null {
  if (proteinType === "vegan" || proteinType === "vegetarian") return "vegetarian";
  if (proteinType === "fish" || proteinType === "poultry" || proteinType === "red_meat") {
    return proteinType;
  }
  return null;
}

/** A meal with meat and a vegetarian side is a meat meal. */
const WEIGHT: Record<BalanceGroup, number> = { red_meat: 4, poultry: 3, fish: 2, vegetarian: 1 };

/**
 * The group a meal counts as. Only recipes that are a meal by themselves count, so a cake
 * for Sunday afternoon is not a vegetarian dinner.
 */
export function mealGroup(recipes: readonly RecipeSummary[]): BalanceGroup | null {
  let heaviest: BalanceGroup | null = null;
  for (const recipe of recipes) {
    if (!isMeal(recipe)) continue;
    const group = groupOf(recipe.proteinType);
    if (group && (heaviest === null || WEIGHT[group] > WEIGHT[heaviest])) heaviest = group;
  }
  return heaviest;
}

function lines(counts: Record<BalanceGroup, number>, targets: BalanceTargets): BalanceLine[] {
  return BALANCE_GROUPS.map((group) => ({ group, count: counts[group], ...targets[group] }));
}

/** Counts the planned meals of a week per group. */
export function weekBalance(
  slots: readonly PlanSlot[],
  recipeOf: (id: string) => RecipeSummary | undefined,
  targets: BalanceTargets = DEFAULT_TARGETS,
): BalanceLine[] {
  const counts: Record<BalanceGroup, number> = { vegetarian: 0, fish: 0, poultry: 0, red_meat: 0 };
  for (const slot of slots) {
    if (slot.kind !== "recipes") continue;
    const group = mealGroup(slot.items.flatMap((item) => recipeOf(item.recipeId) ?? []));
    if (group) counts[group]++;
  }
  return lines(counts, targets);
}

/** The balance after one more meal of a group. */
export function withMeal(
  balance: readonly BalanceLine[],
  group: BalanceGroup | null,
): BalanceLine[] {
  return balance.map((line) => (line.group === group ? { ...line, count: line.count + 1 } : line));
}

/** Meals still missing to reach the least the household aims for. */
export function missing(line: BalanceLine): number {
  return line.min === null ? 0 : Math.max(0, line.min - line.count);
}

/** True when the week already has as many meals of this group as it should at most. */
export function isFull(line: BalanceLine): boolean {
  return line.max !== null && line.count >= line.max;
}
