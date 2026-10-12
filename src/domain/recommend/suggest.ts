import { daysBetween, isoWeekday, type IsoDate } from "../dates";
import { LONG_AGO_DAYS } from "../library/discover";
import { isMeal, suitsMeal, type History, type RecipeSummary } from "../library/summary";
import { effortOf } from "../library/tags";
import { byDayAndMeal, type Meal } from "../plan";
import { rank } from "../rank";
import { groupOf, isFull, missing, withMeal, type BalanceGroup, type BalanceLine } from "./balance";

/**
 * Suggestions for the week plan. Rule based and explainable: a recipe is suggested because
 * someone wants to cook it, because it fills a gap in the week's balance, because it is a
 * favourite, or because the household has not cooked it for a long time. Every suggestion
 * says why. What takes long is kept for the weekend.
 */

export type Reason =
  /** Someone marked it as "want to cook this". */
  | { kind: "wanted" }
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

/** A wish outweighs everything else that speaks for or against a recipe. */
const POINTS = {
  wanted: 8,
  fillsGap: 3,
  favorite: 2,
  longAgo: 1,
  recent: -3,
  groupFull: -4,
} as const;

/** How well a recipe fits the week, and why. */
export function scoreRecipe(recipe: RecipeSummary, context: SuggestContext): Suggestion {
  const reasons: Reason[] = [];
  let score = 0;
  if (recipe.wanted) {
    score += POINTS.wanted;
    reasons.push({ kind: "wanted" });
  }

  // A cake for coffee fills no gap in the week's meals.
  const group = isMeal(recipe) ? groupOf(recipe.proteinType) : null;
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

export interface OpenSlot {
  date: IsoDate;
  meal: Meal;
}

/** What is eaten cold in the evening and is no work to speak of. */
const COLD = new Set(["salat", "vesper"]);

/**
 * Whether a recipe fits the day. From Monday to Friday nobody cooks for hours: lunch takes
 * what is quick or fits a normal day, the evening only what is quick or cold. A recipe whose
 * effort is not known is kept for the weekend. Planning anything by hand is always possible.
 */
export function suitsDay(
  recipe: Pick<RecipeSummary, "category" | "tags" | "prepMinutes">,
  slot: OpenSlot,
): boolean {
  if (slot.meal === "coffee" || isoWeekday(slot.date) > 5) return true;
  const effort = effortOf(recipe);
  if (slot.meal === "lunch") return effort === "schnell" || effort === "alltag";
  if (recipe.category !== null && COLD.has(recipe.category)) return effort !== "aufwendig";
  return effort === "schnell";
}

/** The best recipes for one meal of one day, best first. */
export function suggest(
  recipes: readonly RecipeSummary[],
  slot: OpenSlot,
  context: SuggestContext,
  count: number,
): Suggestion[] {
  return recipes
    .filter(
      (recipe) =>
        suitsMeal(recipe, slot.meal) && suitsDay(recipe, slot) && !context.planned.has(recipe.id),
    )
    .map((recipe) => scoreRecipe(recipe, context))
    .sort(
      (a, b) =>
        b.score - a.score ||
        rank(context.seed, a.recipe.id) - rank(context.seed, b.recipe.id) ||
        a.recipe.id.localeCompare(b.recipe.id),
    )
    .slice(0, count);
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
  const slots = [...open].sort(byDayAndMeal);
  for (const slot of slots) {
    // Each slot draws its own order, or two slots with the same needs would get the same dish.
    const [suggestion] = suggest(
      recipes,
      slot,
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
