import { daysBetween, type IsoDate } from "../dates";
import { LONG_AGO_DAYS } from "../library/discover";
import { suitsMeal, type History, type RecipeSummary } from "../library/summary";
import type { Meal } from "../plan";
import { rank } from "../rank";
import { groupOf, isFull, missing, withMeal, type BalanceGroup, type BalanceLine } from "./balance";

/**
 * Suggestions for the week plan. Rule based and explainable: a recipe is suggested because it
 * fills a gap in the week's balance, because it is a favourite, or because the household has
 * not cooked it for a long time. Every suggestion says why.
 */

export type Reason =
  /** The week still lacks meals of this group. */
  | { kind: "fills_gap"; group: BalanceGroup }
  | { kind: "favorite" }
  /** Cooked before, but not for this many weeks. */
  | { kind: "long_ago"; weeks: number }
  /** Counts against it: on the plan only this many weeks ago. */
  | { kind: "recent"; weeks: number }
  /** Counts against it: the week already has as many meals of this group as it should. */
  | { kind: "group_full"; group: BalanceGroup };

export interface Suggestion {
  recipe: RecipeSummary;
  score: number;
  reasons: Reason[];
}

export interface SuggestContext {
  /** The week as planned so far. */
  balance: readonly BalanceLine[];
  /** Recipes already on this week's plan. Nothing is suggested twice in a week. */
  planned: ReadonlySet<string>;
  /** The last day each recipe was planned before this week. */
  history: History;
  /** Monday of the week being planned. */
  weekStart: IsoDate;
  /** Changes which of several equally good recipes comes first. */
  seed: string;
}

/** A dish from the last weeks is not suggested again so soon. */
export const RECENT_WEEKS = 4;

const POINTS = { fillsGap: 3, favorite: 2, longAgo: 1, recent: -3, groupFull: -4 } as const;

/** How well a recipe fits the week, and why. */
export function scoreRecipe(recipe: RecipeSummary, context: SuggestContext): Suggestion {
  const reasons: Reason[] = [];
  let score = 0;

  const group = groupOf(recipe.proteinType);
  const line = context.balance.find((entry) => entry.group === group);
  if (group && line) {
    if (missing(line) > 0) {
      score += POINTS.fillsGap;
      reasons.push({ kind: "fills_gap", group });
    } else if (isFull(line)) {
      score += POINTS.groupFull;
      reasons.push({ kind: "group_full", group });
    }
  }
  if (recipe.isFavorite) {
    score += POINTS.favorite;
    reasons.push({ kind: "favorite" });
  }
  const last = context.history.get(recipe.id);
  if (last !== undefined) {
    const days = daysBetween(last, context.weekStart);
    const weeks = Math.max(1, Math.round(days / 7));
    if (days < RECENT_WEEKS * 7) {
      score += POINTS.recent;
      reasons.push({ kind: "recent", weeks });
    } else if (days >= LONG_AGO_DAYS) {
      score += POINTS.longAgo;
      reasons.push({ kind: "long_ago", weeks });
    }
  }
  return { recipe, score, reasons };
}

/** The best recipes for one meal, best first. */
export function suggest(
  recipes: readonly RecipeSummary[],
  meal: Meal,
  context: SuggestContext,
  count: number,
): Suggestion[] {
  return recipes
    .filter((recipe) => suitsMeal(recipe, meal) && !context.planned.has(recipe.id))
    .map((recipe) => scoreRecipe(recipe, context))
    .sort(
      (a, b) =>
        b.score - a.score ||
        rank(context.seed, a.recipe.id) - rank(context.seed, b.recipe.id) ||
        a.recipe.id.localeCompare(b.recipe.id),
    )
    .slice(0, count);
}

export interface OpenSlot {
  date: IsoDate;
  meal: Meal;
}

/**
 * One suggestion for every open meal of a week, so that the suggestions add up to a balanced
 * week: each one is chosen as if the ones before it had been accepted. Returns them in the
 * order of the slots; a slot nothing is left for is missing.
 */
export function suggestWeek(
  recipes: readonly RecipeSummary[],
  open: readonly OpenSlot[],
  context: SuggestContext,
): (OpenSlot & { suggestion: Suggestion })[] {
  const result: (OpenSlot & { suggestion: Suggestion })[] = [];
  let balance = context.balance;
  const planned = new Set(context.planned);
  const slots = [...open].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || Number(a.meal === "dinner") - Number(b.meal === "dinner"),
  );
  for (const slot of slots) {
    // Each slot draws its own order, or two slots with the same needs would get the same dish.
    const [suggestion] = suggest(
      recipes,
      slot.meal,
      { ...context, balance, planned, seed: `${context.seed}:${slot.date}:${slot.meal}` },
      1,
    );
    if (!suggestion) continue;
    result.push({ ...slot, suggestion });
    planned.add(suggestion.recipe.id);
    balance = withMeal(balance, groupOf(suggestion.recipe.proteinType));
  }
  return result;
}
