import { addDays, daysBetween, isoWeekday, mondayOf, type IsoDate } from "../dates";
import { LONG_AGO_DAYS } from "../library/discover";
import { isMeal, isSweet, type RecipeSummary } from "../library/summary";
import { EFFORTS, effortOf, type Effort } from "../library/tags";
import type { Meal, PlanSlot } from "../plan";
import {
  BALANCE_GROUPS,
  mealGroup,
  weekBalance,
  type BalanceGroup,
  type BalanceLine,
  type BalanceTargets,
} from "../recommend/balance";
import { monthOf, seasonFit, type SeasonalFood } from "../season/calendar";
import { bucketsOf, daysCounted, weeksCounted, type Bucket, type Period } from "./period";
import { stat, type Stat } from "./stat";

export type { Stat } from "./stat";

/**
 * How the household ate in a period, counted from its plans. A meal planned for a day that
 * has come counts as cooked: nothing records whether it really was.
 */

/** What a cooked meal counts as: a kind of the week's balance, sweet, or neither. */
export type MealKind = BalanceGroup | "sweet" | "other";
export const MEAL_KINDS: readonly MealKind[] = [...BALANCE_GROUPS, "sweet", "other"];

export interface RankedRecipe {
  id: string;
  title: string;
  count: number;
  /** The last day it was cooked: in the period for a ranking, ever for "Mal wieder". */
  last: IsoDate;
}

export interface TrendBar extends Bucket {
  counts: Record<MealKind, number>;
  total: number;
}

export interface GoalWeek {
  weekStart: IsoDate;
  /** The week has not ended yet. */
  running: boolean;
  lines: (BalanceLine & { ok: boolean })[];
}

export interface GoalSummary {
  group: BalanceGroup;
  min: number | null;
  max: number | null;
  /**
   * Weeks that met the goal, and weeks judged: a week still running only once it is
   * decided, by meeting the goal or by going over the most it may have.
   */
  met: number;
  weeks: number;
  /** Meals of the group per week, on average. */
  average: number;
}

export interface WithoutRecipe {
  label: string;
  kind: Exclude<PlanSlot["kind"], "recipes">;
  count: number;
  /** The week it last happened in, to open it. */
  lastWeek: IsoDate;
}

export interface BookRow {
  /** Null for recipes typed in without a cookbook. */
  book: string | null;
  meals: number;
  /** Different recipes of the book cooked in the period. */
  recipes: number;
  /** Recipes of the book ever cooked, and how many it has in the library. */
  everCooked: number;
  inLibrary: number;
}

export interface TagRow {
  ref: string;
  name: string;
  count: number;
}

export type EffortCounts = Record<Effort | "unknown", number>;

export interface MealStats {
  /** Lunches and dinners the period had up to today, and how many of them were planned. */
  mealsPossible: number;
  entered: number;
  /** Meals with a recipe, coffee and cake included. */
  cooked: number;
  /** Meals with a recipe planned for days of the period still to come. */
  ahead: number;
  kinds: Record<MealKind, number>;
  /** Days with something cooked and neither meat nor poultry, and the longest run of them. */
  meatFree: { days: number; ofDays: number; longestRun: number };
  goals: Stat<{ weeks: GoalWeek[]; summary: GoalSummary[] }>;
  trend: Stat<TrendBar[]>;
  top: Stat<RankedRecipe[]>;
  variety: Stat<{ distinct: number; meals: number }>;
  newTried: Stat<RankedRecipe[]>;
  again: Stat<RankedRecipe[]>;
  without: Stat<{ rows: WithoutRecipe[]; total: number }>;
  books: Stat<BookRow[]>;
  leftovers: { extraPortions: number; leftoverMeals: number; linked: number };
  mainIngredients: Stat<TagRow[]>;
  cuisines: Stat<TagRow[]>;
  effort: Stat<{ workday: EffortCounts; weekend: EffortCounts }>;
  season: Stat<{ fitting: number; meals: number; foods: { name: string; count: number }[] }>;
  coffee: { sundays: number; withCake: number; cakes: RankedRecipe[] };
  library: { added: number; addedCooked: number };
}

export interface MealStatsInput {
  period: Period;
  today: IsoDate;
  firstWeek: IsoDate | null;
  /** Every meal the household planned, from its first week to the end of the period. */
  slots: readonly PlanSlot[];
  recipes: ReadonlyMap<string, RecipeSummary>;
  targets: BalanceTargets;
  /** The described tags by their ref, with their group ("Hauptzutat", "Küche"). */
  tags: ReadonlyMap<string, { name: string; group: string }>;
  /** Per recipe, the foods of the season calendar it is made with. */
  seasonalFoods: ReadonlyMap<string, readonly SeasonalFood[]>;
}

/** Enough to say anything: four cooked meals, two weeks for a trend, a dish cooked twice. */
export const NEED = {
  meals: 4,
  trendBars: 2,
  repeat: 2,
  tagged: 3,
  weeksBefore: 4,
} as const;

const TOP = 6;
const TAGS = 5;
const FOODS = 5;

type RecipeSlot = Extract<PlanSlot, { kind: "recipes" }>;

function recipesOf(slot: RecipeSlot, recipes: ReadonlyMap<string, RecipeSummary>) {
  return slot.items.flatMap((item) => recipes.get(item.recipeId) ?? []);
}

/** What a meal counts as, by its heaviest protein, or sweet for a cake and a dessert. */
export function kindOfMeal(recipes: readonly RecipeSummary[]): MealKind {
  const group = mealGroup(recipes);
  if (group) return group;
  return recipes.some(isSweet) ? "sweet" : "other";
}

function emptyKinds(): Record<MealKind, number> {
  return { vegetarian: 0, fish: 0, poultry: 0, red_meat: 0, sweet: 0, other: 0 };
}

const isMainMeal = (meal: Meal) => meal === "lunch" || meal === "dinner";

function rank(
  counts: ReadonlyMap<string, { count: number; last: IsoDate }>,
  recipes: ReadonlyMap<string, RecipeSummary>,
): RankedRecipe[] {
  return [...counts]
    .flatMap(([id, { count, last }]) => {
      const recipe = recipes.get(id);
      return recipe ? [{ id, title: recipe.title, count, last }] : [];
    })
    .sort(
      (a, b) =>
        b.count - a.count || b.last.localeCompare(a.last) || a.title.localeCompare(b.title, "de"),
    );
}

function tally(map: Map<string, { count: number; last: IsoDate }>, id: string, date: IsoDate) {
  const known = map.get(id);
  map.set(id, {
    count: (known?.count ?? 0) + 1,
    last: known && known.last > date ? known.last : date,
  });
}

/** The effort of a meal: that of its most demanding dish that is a meal by itself. */
function effortOfMeal(recipes: readonly RecipeSummary[]): Effort | null {
  const efforts = recipes.filter(isMeal).flatMap((recipe) => effortOf(recipe) ?? []);
  if (efforts.length === 0) return null;
  return EFFORTS[Math.max(...efforts.map((effort) => EFFORTS.indexOf(effort)))];
}

export function mealStats(input: MealStatsInput): MealStats {
  const { period, today, firstWeek, recipes } = input;
  const span = daysCounted(period, today, firstWeek);
  const inSpan = (date: IsoDate) => span !== null && date >= span.from && date <= span.to;
  const slots = [...input.slots].sort((a, b) => a.date.localeCompare(b.date));
  const counted = slots.filter((slot) => inSpan(slot.date));
  const cookedSlots = counted.filter((slot): slot is RecipeSlot => slot.kind === "recipes");
  const mainCooked = cookedSlots.filter((slot) => isMainMeal(slot.meal));
  const days = span ? daysBetween(span.from, span.to) + 1 : 0;

  // Kinds, and the days without meat.
  const kinds = emptyKinds();
  const kindOf = new Map<string, MealKind>();
  for (const slot of cookedSlots) {
    const kind = kindOfMeal(recipesOf(slot, recipes));
    kindOf.set(slot.id, kind);
    kinds[kind]++;
  }
  const dayKinds = new Map<IsoDate, MealKind[]>();
  for (const slot of mainCooked) {
    dayKinds.set(slot.date, [...(dayKinds.get(slot.date) ?? []), kindOf.get(slot.id)!]);
  }
  let meatFreeDays = 0;
  let run = 0;
  let longestRun = 0;
  if (span) {
    for (let date = span.from; date <= span.to; date = addDays(date, 1)) {
      const of = dayKinds.get(date);
      if (!of) continue; // A day without anything cooked neither starts nor breaks a run.
      const free = !of.some((kind) => kind === "red_meat" || kind === "poultry");
      if (free) meatFreeDays++;
      run = free ? run + 1 : 0;
      longestRun = Math.max(longestRun, run);
    }
  }

  // The weekly goals, judged on the whole plan of each week: they are goals for the plan.
  const goalWeeks = weeksCounted(period, today, firstWeek)
    .map((weekStart) => {
      const ofWeek = slots.filter(
        (slot) => slot.date >= weekStart && slot.date <= addDays(weekStart, 6),
      );
      return { weekStart, ofWeek };
    })
    // A week without anything cooked was no week of planning: it is not counted as missed.
    .filter(({ ofWeek }) => ofWeek.some((slot) => slot.kind === "recipes"))
    .map(({ weekStart, ofWeek }): GoalWeek => ({
      weekStart,
      running: addDays(weekStart, 6) >= today,
      lines: weekBalance(ofWeek, (id) => recipes.get(id), input.targets).map((line) => ({
        ...line,
        ok:
          (line.min === null || line.count >= line.min) &&
          (line.max === null || line.count <= line.max),
      })),
    }));
  const goals = stat(goalWeeks.length, 1, () => ({
    weeks: goalWeeks,
    summary: BALANCE_GROUPS.map((group): GoalSummary => {
      const lines = goalWeeks.map((week) => ({
        ...week.lines.find((line) => line.group === group)!,
        running: week.running,
      }));
      const target = input.targets[group];
      const hasGoal = target.min !== null || target.max !== null;
      // A week still running counts once it is decided: met, or already over the most.
      const decided = lines.filter(
        (line) => !line.running || line.ok || (line.max !== null && line.count > line.max),
      );
      return {
        group,
        min: target.min,
        max: target.max,
        met: hasGoal ? decided.filter((line) => line.ok).length : 0,
        weeks: hasGoal ? decided.length : 0,
        average: lines.reduce((sum, line) => sum + line.count, 0) / lines.length,
      };
    }),
  }));

  // The trend: per bar, the meals of each kind.
  const bars = bucketsOf(period, today, firstWeek).map((bucket): TrendBar => {
    const counts = emptyKinds();
    for (const slot of slots) {
      if (slot.kind !== "recipes" || slot.date < bucket.start || slot.date > bucket.end) continue;
      if (slot.date > today || (firstWeek !== null && slot.date < firstWeek)) continue;
      counts[kindOfMeal(recipesOf(slot, recipes))]++;
    }
    return { ...bucket, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });
  const trend = stat(bars.filter((bar) => bar.total > 0).length, NEED.trendBars, () => bars);

  // What was cooked how often, in the period and ever.
  const inPeriod = new Map<string, { count: number; last: IsoDate }>();
  for (const slot of cookedSlots) {
    for (const id of new Set(slot.items.map((item) => item.recipeId)))
      tally(inPeriod, id, slot.date);
  }
  const ranked = rank(inPeriod, recipes);
  const top = stat(ranked[0]?.count ?? 0, NEED.repeat, () =>
    ranked.filter((entry) => entry.count >= NEED.repeat).slice(0, TOP),
  );
  const variety = stat(cookedSlots.length, NEED.meals, () => ({
    distinct: inPeriod.size,
    meals: cookedSlots.length,
  }));

  const ever = new Map<string, { first: IsoDate; count: number; last: IsoDate }>();
  for (const slot of slots) {
    if (slot.kind !== "recipes" || slot.date > today) continue;
    for (const id of new Set(slot.items.map((item) => item.recipeId))) {
      const known = ever.get(id);
      ever.set(id, {
        first: known?.first ?? slot.date,
        count: (known?.count ?? 0) + 1,
        last: slot.date,
      });
    }
  }
  // New is only new against a history: in the household's first weeks everything would be.
  const weeksBefore = new Set(
    slots.filter((slot) => slot.date < period.start).map((slot) => mondayOf(slot.date)),
  ).size;
  const newTried = stat(weeksBefore, NEED.weeksBefore, () =>
    rank(
      new Map(
        [...ever]
          .filter(([, entry]) => inSpan(entry.first))
          .map(([id, entry]) => [id, { count: inPeriod.get(id)?.count ?? 1, last: entry.first }]),
      ),
      recipes,
    ).sort((a, b) => a.last.localeCompare(b.last)),
  );

  // Dishes the household knows and has not had for long, the most cooked and favourites first.
  const earliest = slots.find((slot) => slot.kind === "recipes" && slot.date <= today)?.date;
  const historyDays = earliest ? daysBetween(earliest, today) : 0;
  const again = stat(historyDays, LONG_AGO_DAYS, () =>
    [...ever]
      .filter(([, entry]) => daysBetween(entry.last, today) >= LONG_AGO_DAYS)
      .flatMap(([id, entry]) => {
        const recipe = recipes.get(id);
        return recipe && isMeal(recipe)
          ? [
              {
                id,
                title: recipe.title,
                count: entry.count,
                last: entry.last,
                favorite: recipe.isFavorite,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          b.count - a.count ||
          a.last.localeCompare(b.last),
      )
      .slice(0, TOP)
      .map(({ id, title, count, last }) => ({ id, title, count, last })),
  );

  // Meals without a recipe, by what they were.
  const entered = counted.filter((slot) => isMainMeal(slot.meal));
  const withoutRows = new Map<string, WithoutRecipe>();
  for (const slot of entered) {
    if (slot.kind === "recipes") continue;
    const label =
      slot.kind === "leftovers" ? "Reste" : slot.kind === "skipped" ? "Keiner daheim" : slot.label;
    const key = `${slot.kind}|${label.toLowerCase()}`;
    const known = withoutRows.get(key);
    withoutRows.set(key, {
      label: known?.label ?? label,
      kind: slot.kind,
      count: (known?.count ?? 0) + 1,
      lastWeek: mondayOf(slot.date),
    });
  }
  const withoutTotal = entered.length - mainCooked.length;
  const without = stat(entered.length, NEED.meals, () => ({
    total: withoutTotal,
    rows: [...withoutRows.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"),
    ),
  }));

  // Cookbooks: what was cooked from each, and how much of each was ever cooked.
  const library = [...recipes.values()];
  const books = new Map<string | null, BookRow>();
  for (const slot of cookedSlots) {
    for (const recipe of recipesOf(slot, recipes)) {
      const row = books.get(recipe.sourceBook) ?? {
        book: recipe.sourceBook,
        meals: 0,
        recipes: 0,
        everCooked: library.filter(
          (other) => other.sourceBook === recipe.sourceBook && ever.has(other.id),
        ).length,
        inLibrary: library.filter((other) => other.sourceBook === recipe.sourceBook).length,
      };
      row.meals++;
      books.set(recipe.sourceBook, row);
    }
  }
  for (const row of books.values()) {
    row.recipes = [...inPeriod.keys()].filter(
      (id) => recipes.get(id)?.sourceBook === row.book,
    ).length;
  }
  const bookStat = stat(cookedSlots.length, 1, () =>
    [...books.values()].sort(
      (a, b) => b.meals - a.meals || (a.book ?? "").localeCompare(b.book ?? "", "de"),
    ),
  );

  // Leftovers: portions cooked on purpose, and the meals they made.
  const leftoverSlots = entered.filter((slot) => slot.kind === "leftovers");
  const leftovers = {
    extraPortions: mainCooked.reduce((sum, slot) => sum + (slot.extra ?? 0), 0),
    leftoverMeals: leftoverSlots.length,
    linked: leftoverSlots.filter((slot) => slot.kind === "leftovers" && slot.ofSlotId !== null)
      .length,
  };

  // Main ingredients and cuisines: each once per meal.
  const tagRows = (group: string): Stat<TagRow[]> => {
    const counts = new Map<string, number>();
    let tagged = 0;
    for (const slot of mainCooked) {
      const refs = new Set(
        recipesOf(slot, recipes)
          .flatMap((recipe) => recipe.tags)
          .filter((ref) => input.tags.get(ref)?.group === group),
      );
      if (refs.size > 0) tagged++;
      for (const ref of refs) counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
    return stat(tagged, NEED.tagged, () =>
      [...counts]
        .map(([ref, count]) => ({ ref, name: input.tags.get(ref)!.name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"))
        .slice(0, TAGS),
    );
  };

  // How much work the meals were, on working days and at the weekend.
  const emptyEffort = (): EffortCounts => ({ schnell: 0, alltag: 0, aufwendig: 0, unknown: 0 });
  const workday = emptyEffort();
  const weekend = emptyEffort();
  for (const slot of mainCooked) {
    const effort = effortOfMeal(recipesOf(slot, recipes)) ?? "unknown";
    (isoWeekday(slot.date) <= 5 ? workday : weekend)[effort]++;
  }
  const effort = stat(mainCooked.length, NEED.meals, () => ({ workday, weekend }));

  // The season: meals that fit the month they were cooked in, and what made them fit.
  const foodCounts = new Map<string, number>();
  let fitting = 0;
  for (const slot of mainCooked) {
    const fits = recipesOf(slot, recipes)
      .map((recipe) =>
        seasonFit(input.seasonalFoods.get(recipe.id) ?? [], recipe.tags, monthOf(slot.date)),
      )
      .filter((fit) => fit.fits);
    if (fits.length === 0) continue;
    fitting++;
    for (const name of new Set(fits.flatMap((fit) => fit.foods))) {
      foodCounts.set(name, (foodCounts.get(name) ?? 0) + 1);
    }
  }
  const season = stat(mainCooked.length, NEED.meals, () => ({
    fitting,
    meals: mainCooked.length,
    foods: [...foodCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"))
      .slice(0, FOODS),
  }));

  // Coffee and cake on Sundays.
  const sundays = span
    ? Array.from({ length: days }, (_, at) => addDays(span.from, at)).filter(
        (date) => isoWeekday(date) === 7,
      ).length
    : 0;
  const coffeeSlots = cookedSlots.filter((slot) => slot.meal === "coffee");
  const cakes = new Map<string, { count: number; last: IsoDate }>();
  for (const slot of coffeeSlots) {
    for (const item of slot.items) tally(cakes, item.recipeId, slot.date);
  }

  // The library: recipes added in the period, and how many of them made it onto a plate.
  const added = library.filter(
    (recipe) => recipe.addedOn >= period.start && recipe.addedOn <= period.end,
  );

  return {
    mealsPossible: days * 2,
    entered: entered.length,
    cooked: cookedSlots.length,
    ahead: slots.filter(
      (slot) => slot.kind === "recipes" && slot.date > today && slot.date <= period.end,
    ).length,
    kinds,
    meatFree: { days: meatFreeDays, ofDays: dayKinds.size, longestRun },
    goals,
    trend,
    top,
    variety,
    newTried,
    again,
    without,
    books: bookStat,
    leftovers,
    mainIngredients: tagRows("Hauptzutat"),
    cuisines: tagRows("Küche"),
    effort,
    season,
    coffee: { sundays, withCake: coffeeSlots.length, cakes: rank(cakes, recipes).slice(0, 3) },
    library: {
      added: added.length,
      addedCooked: added.filter((recipe) => ever.has(recipe.id)).length,
    },
  };
}
