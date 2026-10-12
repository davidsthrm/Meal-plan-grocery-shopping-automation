import { addDays, type IsoDate } from "./dates";

export type Meal = "lunch" | "dinner";

interface SlotBase {
  id: string;
  date: IsoDate;
  meal: Meal;
}

/** One recipe cooked for a slot. A slot can hold a main dish plus sides. */
export interface SlotItem {
  recipeId: string;
  servings: number;
}

/**
 * What is planned for one meal. Only `recipes` slots produce shopping list lines.
 * A slot that is not planned yet simply does not exist.
 */
export type PlanSlot =
  | (SlotBase & { kind: "recipes"; items: SlotItem[] })
  /** A meal without a recipe, e.g. "Vesper". */
  | (SlotBase & { kind: "free_text"; label: string })
  /** Leftovers. The source meal is optional and may lie in an earlier week. */
  | (SlotBase & { kind: "leftovers"; ofSlotId: string | null })
  /** Eaten elsewhere or replaced by an activity: "bei Oma", "Handball + Yoga". */
  | (SlotBase & { kind: "away"; label: string })
  | (SlotBase & { kind: "skipped" });

export const MEALS: readonly Meal[] = ["lunch", "dinner"];

/** A slot's content without its place in the calendar, as it is entered or copied. */
export type SlotContent =
  | { kind: "recipes"; items: SlotItem[] }
  | { kind: "free_text"; label: string }
  | { kind: "leftovers" }
  | { kind: "away"; label: string }
  | { kind: "skipped" };

export interface NewSlot {
  date: IsoDate;
  meal: Meal;
  content: SlotContent;
}

/** Identifies a meal of a week: "2026-10-13:dinner". */
export function slotKey(date: IsoDate, meal: Meal): string {
  return `${date}:${meal}`;
}

/**
 * A week as a starting point for another one, `days` later. Only meals the target week has
 * not planned yet are taken over. Leftovers stay leftovers, but lose the link to the meal
 * they came from: that meal belongs to the old week.
 */
export function copyOfWeek(
  source: readonly PlanSlot[],
  days: number,
  taken: ReadonlySet<string>,
): NewSlot[] {
  const copies: NewSlot[] = [];
  for (const slot of source) {
    const date = addDays(slot.date, days);
    if (taken.has(slotKey(date, slot.meal))) continue;
    let content: SlotContent;
    if (slot.kind === "recipes") {
      content = { kind: "recipes", items: slot.items.map((item) => ({ ...item })) };
    } else if (slot.kind === "free_text" || slot.kind === "away") {
      content = { kind: slot.kind, label: slot.label };
    } else {
      content = { kind: slot.kind };
    }
    copies.push({ date, meal: slot.meal, content });
  }
  return copies;
}
