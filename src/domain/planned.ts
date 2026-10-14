import { mondayOf, planningWeek, type IsoDate } from "./dates";
import { byDayAndMeal, type Meal, type PlanExtra, type PlanSlot } from "./plan";

/**
 * Whether a recipe is on the plan of the week the household is in, so that its page says
 * "Eingeplant" instead of offering to plan it once more.
 */

/**
 * The weeks that count as now: the running week, and from Saturday on also the coming one,
 * which the planner already shows then.
 */
export function currentWeeks(today: IsoDate): IsoDate[] {
  const running = mondayOf(today);
  const planning = planningWeek(today);
  return planning === running ? [running] : [running, planning];
}

/** A week's plan as far as it matters here: its meals and what it needs besides them. */
export interface WeekOnPlan {
  weekStart: IsoDate;
  slots: readonly PlanSlot[];
  extras: readonly PlanExtra[];
}

/** Where a recipe is planned: the first meal it is on, or only the week it is an extra of. */
export type PlannedAt =
  { week: IsoDate; date: IsoDate; meal: Meal } | { week: IsoDate; date: null; meal: null };

/** Where a recipe stands on the given weeks' plans, the earliest week first. Null for nowhere. */
export function plannedAt(recipeId: string, weeks: readonly WeekOnPlan[]): PlannedAt | null {
  const byWeek = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  for (const { weekStart, slots, extras } of byWeek) {
    const [first] = slots
      .filter(
        (slot) => slot.kind === "recipes" && slot.items.some((item) => item.recipeId === recipeId),
      )
      .sort(byDayAndMeal);
    if (first) return { week: weekStart, date: first.date, meal: first.meal };
    if (extras.some((extra) => extra.recipeId === recipeId)) {
      return { week: weekStart, date: null, meal: null };
    }
  }
  return null;
}
