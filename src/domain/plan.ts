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
  /**
   * The moment it was put on the meal, in milliseconds: an errand done on that day before
   * it has not bought for it either. Not known for meals planned before this was recorded.
   */
  plannedAt?: number | null;
}

/**
 * What is planned for one meal. Only `recipes` slots produce shopping list lines.
 * A slot that is not planned yet simply does not exist.
 */
export type PlanSlot =
  | (SlotBase & {
      kind: "recipes";
      items: SlotItem[];
      /**
       * "Mehr kochen": portions cooked beyond the persons, for leftovers on a later meal.
       * Added to every recipe of the meal that is cooked for persons. Zero or left out: none.
       */
      extra?: number;
      /** What is bought to go with the recipes and has none: a spelt baguette with a soup. */
      foods?: SlotFood[];
    })
  /** A meal without a recipe, e.g. "Vesper". It can still need things from the shops. */
  | (SlotBase & { kind: "free_text"; label: string; foods?: SlotFood[] })
  /** Leftovers. The source meal is optional and may lie in an earlier week. */
  | (SlotBase & { kind: "leftovers"; ofSlotId: string | null })
  /** Eaten elsewhere or replaced by an activity: "bei Oma", "Handball + Yoga". */
  | (SlotBase & { kind: "away"; label: string })
  | (SlotBase & { kind: "skipped" });

/**
 * Something to buy for a meal that no recipe covers: bread and cold cuts for a "Vesper", or a
 * baguette next to a soup. It is a name as on the handwritten list, not an amount.
 */
export interface SlotFood {
  label: string;
  /** How many, where someone said so: "1 Dinkelbaguette". Null or left out: a name only. */
  quantity?: number | null;
  /** The catalog ingredient the label names, if it names one. */
  ingredientId: string | null;
  /** Where it is bought for this meal. Null means where the catalog says. */
  shopId: string | null;
  /** The day and the moment it was added to the meal, as for a recipe. */
  plannedOn?: IsoDate | null;
  plannedAt?: number | null;
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
  /** The day and the moment it was added, as for a recipe on a meal. */
  plannedOn?: IsoDate | null;
  plannedAt?: number | null;
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

/**
 * Whether every lunch and dinner of the week from `monday` has something planned: a recipe,
 * leftovers, a meal away or one skipped on purpose. Coffee on Sunday is optional and never
 * keeps a week from being planned. What the week page celebrates, once.
 */
export function weekPlanned(slots: readonly { date: IsoDate; meal: Meal }[], monday: IsoDate) {
  const taken = new Set(slots.map((slot) => slotKey(slot.date, slot.meal)));
  for (let day = 0; day < 7; day++) {
    const date = addDays(monday, day);
    if (MEALS.some((meal) => !taken.has(slotKey(date, meal)))) return false;
  }
  return true;
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
 * How much of a recipe is cooked on a meal: its planned servings, and for a recipe cooked for
 * persons the meal's extra portions too ("Mehr kochen"). A cake for one tin stays one cake.
 */
export function cookedServings(
  servings: number,
  extra: number | undefined,
  forPersons: boolean,
): number {
  return forPersons ? servings + (extra ?? 0) : servings;
}

/** A slot's content without its place in the calendar, as it is entered or copied. */
export type SlotContent =
  | {
      kind: "recipes";
      items: SlotItem[];
      extra?: number;
      /**
       * What goes with the recipes without one. Left out, a meal that had recipes keeps the
       * foods it had: a side added or a person more does not lose the baguette.
       */
      foods?: SlotFood[];
    }
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

/** One meal of the week as the strip beside the recipe chooser shows it. */
export interface StripMeal {
  meal: Meal;
  /** What it holds, or null while nothing is planned. */
  slot: PlanSlot | null;
  /** The meal a recipe is being chosen for. */
  current: boolean;
}

/**
 * The week beside the recipe chooser on an iPad, day by day: lunch and dinner always, coffee
 * on Sunday only when something is planned for it or it is the meal being chosen for.
 */
export function weekStrip(
  week: IsoDate,
  slots: readonly PlanSlot[],
  current: { date: IsoDate; meal: Meal } | null,
): { date: IsoDate; meals: StripMeal[] }[] {
  const at = new Map(slots.map((slot) => [slotKey(slot.date, slot.meal), slot]));
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(week, offset);
    const meals = mealsOf(date)
      .map((meal) => ({
        meal,
        slot: at.get(slotKey(date, meal)) ?? null,
        current: current?.date === date && current.meal === meal,
      }))
      .filter((entry) => entry.meal !== "coffee" || entry.slot !== null || entry.current);
    return { date, meals };
  });
}
