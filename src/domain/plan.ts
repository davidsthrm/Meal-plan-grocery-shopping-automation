import type { IsoDate } from "./dates";

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
