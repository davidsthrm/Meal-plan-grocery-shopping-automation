import { addDays, isoWeekday, type IsoDate } from "./dates";

/** "coffee" is coffee and cake in the afternoon: a place for what is no lunch and no dinner. */
export type Meal = "lunch" | "dinner" | "coffee";

interface SlotBase {
  id: string;
  date: IsoDate;
  meal: Meal;
}

/** One recipe cooked for a slot. A slot can hold a main dish plus sides. */
export interface SlotItem {
  recipeId: string;
  servings: number;
  /**
   * The day the recipe was put on this meal. A shopping day before that cannot have bought
   * for it. Not known for meals planned before this was recorded.
   */
  plannedOn?: IsoDate | null;
}

/**
 * What is planned for one meal. Only `recipes` slots produce shopping list lines.
 * A slot that is not planned yet simply does not exist.
 */
export type PlanSlot =
  | (SlotBase & { kind: "recipes"; items: SlotItem[] })
  /** A meal without a recipe, e.g. "Vesper". It can still need things from the shops. */
  | (SlotBase & { kind: "free_text"; label: string; foods?: SlotFood[] })
  /** Leftovers. The source meal is optional and may lie in an earlier week. */
  | (SlotBase & { kind: "leftovers"; ofSlotId: string | null })
  /** Eaten elsewhere or replaced by an activity: "bei Oma", "Handball + Yoga". */
  | (SlotBase & { kind: "away"; label: string })
  | (SlotBase & { kind: "skipped" });

/**
 * Something to buy for a meal without a recipe: bread and cold cuts for a "Vesper". It is a
 * name as on the handwritten list, not an amount.
 */
export interface SlotFood {
  label: string;
  /** The catalog ingredient the label names, if it names one. */
  ingredientId: string | null;
  /** Where it is bought for this meal. Null means where the catalog says. */
  shopId: string | null;
  /** The day it was added to the meal, as for a recipe. */
  plannedOn?: IsoDate | null;
}

/** A recipe the week needs outside its meals: two cakes for an invitation. */
export interface PlanExtra {
  recipeId: string;
  servings: number;
  /** What it is for. */
  note: string | null;
  /**
   * The day it is needed, within its week: it is bought for that day like a meal. Null
   * for no day in particular: bought on the week's first supermarket day.
   */
  date?: IsoDate | null;
  /** The day it was added, as for a recipe on a meal. */
  plannedOn?: IsoDate | null;
}

/**
 * Meals without a recipe that are one tap away. "Oma Heidrun" is where the household eats
 * regularly: a visit like any meal away from home, with a name of its own.
 */
export const MEALS_WITHOUT_RECIPE = [
  { label: "Vesper", kind: "free_text" },
  { label: "Reste", kind: "leftovers" },
  { label: "Auswärts", kind: "away" },
  { label: "Oma Heidrun", kind: "away" },
  { label: "Keiner daheim", kind: "skipped" },
] as const;

/** The meal without a recipe a typed text names, however it is capitalised. */
export function namedMeal(text: string): (typeof MEALS_WITHOUT_RECIPE)[number] | undefined {
  const typed = text.trim().toLowerCase();
  return MEALS_WITHOUT_RECIPE.find((entry) => entry.label.toLowerCase() === typed);
}

/** The meals every day has. */
export const MEALS: readonly Meal[] = ["lunch", "dinner"];

/** The meals of one day, in the order of the day. Sunday has coffee and cake. */
export function mealsOf(date: IsoDate): Meal[] {
  return isoWeekday(date) === 7 ? ["lunch", "coffee", "dinner"] : ["lunch", "dinner"];
}

const MEAL_ORDER: Record<Meal, number> = { lunch: 0, coffee: 1, dinner: 2 };

/** Sorts meals by day and by their time of day. */
export function byDayAndMeal(
  a: { date: IsoDate; meal: Meal },
  b: { date: IsoDate; meal: Meal },
): number {
  return a.date.localeCompare(b.date) || MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal];
}

/**
 * The lunches and dinners after `after` that have nothing planned yet (`taken` holds the
 * `slotKey` of every planned meal), up to and including `lastDay`, in order. Coffee on
 * Sunday is optional and never among them.
 */
export function openMealsAfter(
  after: { date: IsoDate; meal: Meal },
  taken: ReadonlySet<string>,
  lastDay: IsoDate,
): { date: IsoDate; meal: Meal }[] {
  const open: { date: IsoDate; meal: Meal }[] = [];
  for (let date = after.date; date <= lastDay; date = addDays(date, 1)) {
    for (const meal of MEALS) {
      const candidate = { date, meal };
      if (byDayAndMeal(candidate, after) <= 0) continue;
      if (!taken.has(slotKey(date, meal))) open.push(candidate);
    }
  }
  return open;
}

/**
 * The next lunch or dinner after `after` that has nothing planned yet, up to and including
 * `lastDay`. Null when every meal until then is planned.
 */
export function nextOpenMeal(
  after: { date: IsoDate; meal: Meal },
  taken: ReadonlySet<string>,
  lastDay: IsoDate,
): { date: IsoDate; meal: Meal } | null {
  return openMealsAfter(after, taken, lastDay)[0] ?? null;
}

/** How many days after a meal its leftovers can be eaten. */
export const LEFTOVER_DAYS = 3;

/**
 * "Mehr kochen": the recipes of a meal with `extra` more portions, for leftovers. Only what
 * is cooked for persons gets more; a cake for one tin stays one cake. Null when nothing of
 * the meal is cooked for persons.
 */
export function cookMore(
  items: readonly SlotItem[],
  extra: number,
  forPersons: (recipeId: string) => boolean,
): SlotItem[] | null {
  if (extra <= 0 || !items.some((item) => forPersons(item.recipeId))) return null;
  return items.map((item) =>
    forPersons(item.recipeId) ? { ...item, servings: item.servings + extra } : item,
  );
}

/** A slot's content without its place in the calendar, as it is entered or copied. */
export type SlotContent =
  | { kind: "recipes"; items: SlotItem[] }
  | { kind: "free_text"; label: string; foods?: SlotFood[] }
  /** Leftovers, of the meal they were cooked with where that is known. */
  | { kind: "leftovers"; ofSlotId?: string | null }
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
