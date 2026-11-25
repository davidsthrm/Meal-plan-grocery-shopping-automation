import type { IsoDate } from "./dates";
import { byDayAndMeal, type Meal } from "./plan";

/** Where a meal stands in its week. */
export interface Place {
  date: IsoDate;
  meal: Meal;
}

/** A meal as far as moving it goes: its place, and for leftovers the meal they are from. */
export interface Movable extends Place {
  id: string;
  kind: string;
  ofSlotId?: string | null;
}

/**
 * What moving a meal to a place of its week does. The meal itself moves, not what it holds:
 * its recipes, persons, extra portions, foods and typed text go with it, and leftovers keep
 * the meal they are from. `slots` is the week after the move.
 */
export type MealMove<T> =
  | { kind: "stay" }
  | { kind: "move"; slots: T[] }
  | { kind: "swap"; other: T; slots: T[] }
  /** Leftovers would come before the meal they are cooked with, or at the same time. */
  | { kind: "refused"; leftovers: T; source: T };

/**
 * Moves `moving` to `to`: a free place takes it, a planned one swaps with it (decided on 25
 * November 2026: plans change). Refused where leftovers would stand before the meal they
 * are from; only links of the two meals that move are looked at.
 */
export function moveMeal<T extends Movable>(
  slots: readonly T[],
  moving: T,
  to: Place,
): MealMove<T> {
  if (moving.date === to.date && moving.meal === to.meal) return { kind: "stay" };
  const other = slots.find(
    (slot) => slot.id !== moving.id && slot.date === to.date && slot.meal === to.meal,
  );
  const moved = slots.map((slot) =>
    slot.id === moving.id
      ? { ...slot, date: to.date, meal: to.meal }
      : slot.id === other?.id
        ? { ...slot, date: moving.date, meal: moving.meal }
        : slot,
  );
  const after = new Map(moved.map((slot) => [slot.id, slot]));
  const before = new Map(slots.map((slot) => [slot.id, slot]));
  const moves = (id: string) => id === moving.id || id === other?.id;
  for (const leftovers of moved) {
    if (leftovers.kind !== "leftovers" || !leftovers.ofSlotId) continue;
    const source = after.get(leftovers.ofSlotId);
    if (!source || !(moves(leftovers.id) || moves(source.id))) continue;
    if (byDayAndMeal(leftovers, source) <= 0) {
      return {
        kind: "refused",
        leftovers: before.get(leftovers.id) as T,
        source: before.get(source.id) as T,
      };
    }
  }
  return other ? { kind: "swap", other, slots: moved } : { kind: "move", slots: moved };
}
