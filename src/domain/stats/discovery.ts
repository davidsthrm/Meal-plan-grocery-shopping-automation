import { addDays, mondayOf, type IsoDate } from "../dates";
import type { RecipeSummary } from "../library/summary";
import type { PlanSlot } from "../plan";
import type { Period } from "./period";

/**
 * How much the family discovers: dishes cooked for the first time, how much of the library
 * was ever cooked, the cuisines tried, and a few badges for trying something new. They
 * stand in "Statistik", where looking back belongs, not on "Entdecken" (October 2026). A
 * meal of a day that has come counts as cooked, as everywhere in the statistics.
 */

export interface Badge {
  key: string;
  title: string;
  /** Where it stands: "3 von 5", or when and how it was earned. */
  detail: string;
  earned: boolean;
  /** How far towards it, 0 to 1. */
  progress: number;
}

export interface DiscoveryStats {
  /** Dishes cooked for the first time in the period. */
  newDishes: number;
  /** Recipes of the library ever cooked, and how many it has. */
  everCooked: number;
  library: number;
  /** Cuisines cooked in the period, of those the library has recipes of. */
  cuisines: { cooked: number; of: number };
  badges: Badge[];
}

export interface DiscoveryInput {
  period: Period;
  today: IsoDate;
  /** Every meal the household planned, from its first week on. */
  slots: readonly PlanSlot[];
  recipes: ReadonlyMap<string, RecipeSummary>;
  /** The described tags by their ref, with their group ("Küche"). */
  tags: ReadonlyMap<string, { name: string; group: string }>;
}

const NEW_IN_A_MONTH = 5;
const WEEKS_IN_A_ROW = 4;
const DIFFERENT_DISHES = 50;
/** A cookbook counts for its badge from this many recipes on, and half of it cooked. */
const BOOK_AT_LEAST = 10;
const BOOK_SHARE = 0.5;

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function discoveryStats({
  period,
  today,
  slots,
  recipes,
  tags,
}: DiscoveryInput): DiscoveryStats {
  // The first day each recipe was cooked, up to today.
  const first = new Map<string, IsoDate>();
  for (const slot of slots) {
    if (slot.kind !== "recipes" || slot.date > today) continue;
    for (const item of slot.items) {
      const before = first.get(item.recipeId);
      if (recipes.has(item.recipeId) && (before === undefined || slot.date < before)) {
        first.set(item.recipeId, slot.date);
      }
    }
  }
  const inPeriod = (day: IsoDate) => day >= period.start && day <= period.end;
  const cuisineOf = (id: string) =>
    (recipes.get(id)?.tags ?? []).filter((tag) => tags.get(tag)?.group === "Küche");
  const libraryCuisines = new Set([...recipes.keys()].flatMap(cuisineOf));
  const periodCuisines = new Set(
    slots
      .filter((slot) => slot.kind === "recipes" && inPeriod(slot.date) && slot.date <= today)
      .flatMap((slot) => (slot.kind === "recipes" ? slot.items : []))
      .flatMap((item) => cuisineOf(item.recipeId)),
  );
  const everCuisines = new Set([...first.keys()].flatMap(cuisineOf));

  return {
    newDishes: [...first.values()].filter(inPeriod).length,
    everCooked: first.size,
    library: recipes.size,
    cuisines: { cooked: periodCuisines.size, of: libraryCuisines.size },
    badges: [
      monthBadge(first),
      {
        key: "kuechen",
        title: "Jede Küche einmal",
        detail: `${everCuisines.size} von ${libraryCuisines.size} Küchen`,
        earned: libraryCuisines.size > 0 && everCuisines.size >= libraryCuisines.size,
        progress: share(everCuisines.size, libraryCuisines.size),
      },
      streakBadge(first),
      {
        key: "gerichte",
        title: `${DIFFERENT_DISHES} verschiedene Gerichte`,
        detail:
          first.size >= DIFFERENT_DISHES
            ? `${first.size} verschiedene gekocht`
            : `${first.size} von ${DIFFERENT_DISHES}`,
        earned: first.size >= DIFFERENT_DISHES,
        progress: share(first.size, DIFFERENT_DISHES),
      },
      bookBadge(first, recipes),
    ],
  };
}

function share(have: number, need: number): number {
  return need === 0 ? 0 : Math.min(1, have / need);
}

/** Five dishes new in one calendar month. */
function monthBadge(first: ReadonlyMap<string, IsoDate>): Badge {
  const perMonth = new Map<string, number>();
  for (const day of first.values()) {
    perMonth.set(day.slice(0, 7), (perMonth.get(day.slice(0, 7)) ?? 0) + 1);
  }
  const [month, best] = [...perMonth].sort(
    (a, b) => b[1] - a[1] || b[0].localeCompare(a[0]),
  )[0] ?? [null, 0];
  const name = month ? `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : "";
  return {
    key: "monat",
    title: `${NEW_IN_A_MONTH} Neue in einem Monat`,
    detail:
      best >= NEW_IN_A_MONTH
        ? `${best} im ${name}`
        : best > 0
          ? `Bisher ${best} im ${name}`
          : "Noch nichts Neues gekocht",
    earned: best >= NEW_IN_A_MONTH,
    progress: share(best, NEW_IN_A_MONTH),
  };
}

/** Four weeks in a row, each with a dish new to the family. */
function streakBadge(first: ReadonlyMap<string, IsoDate>): Badge {
  const weeks = [...new Set([...first.values()].map(mondayOf))].sort();
  let longest = 0;
  let run = 0;
  weeks.forEach((week, at) => {
    run = at > 0 && addDays(weeks[at - 1], 7) === week ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return {
    key: "wochen",
    title: `${WEEKS_IN_A_ROW} Wochen, jede mit Neuem`,
    detail: `Längste Folge: ${longest === 1 ? "1 Woche" : `${longest} Wochen`}`,
    earned: longest >= WEEKS_IN_A_ROW,
    progress: share(longest, WEEKS_IN_A_ROW),
  };
}

/** Half of a cookbook cooked, of one with at least ten recipes. */
function bookBadge(
  first: ReadonlyMap<string, IsoDate>,
  recipes: ReadonlyMap<string, RecipeSummary>,
): Badge {
  const books = new Map<string, { recipes: number; cooked: number }>();
  for (const recipe of recipes.values()) {
    if (!recipe.sourceBook) continue;
    const book = books.get(recipe.sourceBook) ?? { recipes: 0, cooked: 0 };
    book.recipes += 1;
    if (first.has(recipe.id)) book.cooked += 1;
    books.set(recipe.sourceBook, book);
  }
  const [name, best] = [...books]
    .filter(([, book]) => book.recipes >= BOOK_AT_LEAST)
    .sort((a, b) => b[1].cooked / b[1].recipes - a[1].cooked / a[1].recipes)[0] ?? [null, null];
  const ratio = best ? best.cooked / best.recipes : 0;
  return {
    key: "kochbuch",
    title: "Ein Kochbuch zur Hälfte",
    detail: best
      ? `${name}: ${best.cooked} von ${best.recipes}`
      : "Noch kein Kochbuch mit 10 Rezepten",
    earned: ratio >= BOOK_SHARE,
    progress: share(ratio, BOOK_SHARE),
  };
}
