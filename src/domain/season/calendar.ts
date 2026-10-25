import { searchKey } from "../library/filter";

/**
 * When fruit and vegetables are in season in Germany. The calendar itself is data
 * (`supabase/seed/seasons.ts`) and is handed to these functions, so that it can be changed
 * without touching them and read again by later features (planning by what is on offer).
 */

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export const MONTHS: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const MONTH_NAME: Record<Month, string> = {
  1: "Januar",
  2: "Februar",
  3: "März",
  4: "April",
  5: "Mai",
  6: "Juni",
  7: "Juli",
  8: "August",
  9: "September",
  10: "Oktober",
  11: "November",
  12: "Dezember",
};

export type FoodKind = "gemuese" | "salat" | "obst" | "kraeuter" | "pilze";

export const FOOD_KIND_NAME: Record<FoodKind, string> = {
  gemuese: "Gemüse",
  salat: "Salat",
  obst: "Obst",
  kraeuter: "Kräuter",
  pilze: "Pilze",
};

export interface SeasonalFood {
  /** Stable, for the address and for other data to refer to: "kuerbis". */
  key: string;
  /** As the household reads it: "Kürbis". */
  name: string;
  kind: FoodKind;
  /**
   * What it is called in a recipe or the catalog. A name finds itself and the words that end
   * in it: "Kürbis" finds "Hokkaido-Kürbis" and "Butternutkürbis".
   */
  names: string[];
  /** Names that end the same way and are something else: "Kichererbsen" are no peas. */
  unlike?: string[];
  /** The months it is harvested in Germany, from the field or the tree. */
  fresh: Month[];
  /** The months it comes from German storage, after the harvest. */
  stored?: Month[];
  /**
   * How much it says about a dish that it is in it, where the length of its season does not
   * say it: a herb is in half the recipes, wild garlic only in spring's.
   */
  weight?: number;
}

export type Availability = "fresh" | "stored" | null;

export function monthOf(date: string): Month {
  return Number(date.slice(5, 7)) as Month;
}

export function nextMonth(month: Month, step = 1): Month {
  return (((((month - 1 + step) % 12) + 12) % 12) + 1) as Month;
}

/** Whether a food comes from the field now, from storage, or not from Germany at all. */
export function availability(food: SeasonalFood, month: Month): Availability {
  if (food.fresh.includes(month)) return "fresh";
  return food.stored?.includes(month) ? "stored" : null;
}

/**
 * How much a food in season says for a dish: the shorter its season, the more. What comes
 * from storage all year (onions, carrots, apples) says almost nothing.
 */
export function seasonWeight(food: SeasonalFood): number {
  if (food.weight !== undefined) return food.weight;
  if (food.kind === "kraeuter") return 0.5;
  const all = new Set([...food.fresh, ...(food.stored ?? [])]);
  if (all.size >= 11) return 0.5;
  if (food.fresh.length <= 4) return 3;
  return food.fresh.length <= 6 ? 2 : 1;
}

/** A food whose season is short, eaten outside it: asparagus in October. */
export function isOutOfSeason(food: SeasonalFood, month: Month): boolean {
  return availability(food, month) === null && food.fresh.length <= 5;
}

/** Words that make a product of the fresh food: a tin, frozen, dried, pickled. */
const PRESERVED = [
  "dose",
  "konserv",
  "glas",
  "tk",
  "tiefgekuhl",
  "tiefkuhl",
  "gefror",
  "getrocknet",
  "eingelegt",
  "passiert",
  "stuckig",
];

const words = (text: string) =>
  text
    .split(/[^\p{L}\p{N}]+/u)
    .map(searchKey)
    .filter(Boolean);

/**
 * Whether a name is the food: the name itself, a longer name ending in it ("gelbe Paprika",
 * "Hokkaido-Kürbis"), or one word that ends in it ("Butternutkürbis"). Not what is made of it:
 * "Kürbiskerne" end in something else, and a tin or a frozen pack is not fresh.
 */
function names(food: SeasonalFood, text: string): number {
  const said = words(text);
  if (said.length === 0) return 0;
  const joined = said.join(" ");
  if (food.unlike?.some((other) => joined.includes(words(other).join(" ")))) return 0;
  let best = 0;
  for (const name of food.names) {
    const own = words(name);
    if (own.length === 0) continue;
    const phrase = own.join(" ");
    const last = said[said.length - 1];
    const fits =
      joined === phrase ||
      joined.endsWith(` ${phrase}`) ||
      (own.length === 1 && phrase.length >= 4 && last.endsWith(phrase));
    if (fits) best = Math.max(best, phrase.length);
  }
  return best;
}

/** A name that says the product is kept: "Mais (Dose)", "TK-Erbsen", "getrocknete Tomaten". */
function isPreserved(text: string): boolean {
  return words(text).some((word) => PRESERVED.some((mark) => word.startsWith(mark)));
}

/**
 * The food of the calendar an ingredient is, by its name and its other names. Of several
 * that fit the one with the longest name wins: "Rosenkohl" before "Kohl". An ingredient one
 * of whose names says it is tinned, frozen or dried is no fresh food, whatever its other
 * names: the catalog's "Mais (Dose)" is also called "Mais".
 */
export function foodFor(
  calendar: readonly SeasonalFood[],
  ingredientNames: readonly string[],
): SeasonalFood | null {
  if (ingredientNames.some(isPreserved)) return null;
  let best: SeasonalFood | null = null;
  let length = 0;
  for (const food of calendar) {
    for (const name of ingredientNames) {
      const fit = names(food, name);
      if (fit > length) {
        best = food;
        length = fit;
      }
    }
  }
  return best;
}

/** What the season says about one recipe in one month. */
export interface SeasonFit {
  /** The higher, the more of what it needs is in season now. */
  points: number;
  /** Whether it belongs on "Passt zur Saison". */
  fits: boolean;
  /** The foods in season now it is made with, the strongest first: what the card says. */
  foods: string[];
}

/** The tag of the season a month belongs to: spring starts in March. */
export function seasonTagOf(month: Month): "fruehling" | "sommer" | "herbst" | "winter" {
  if (month >= 3 && month <= 5) return "fruehling";
  if (month >= 6 && month <= 8) return "sommer";
  return month >= 9 && month <= 11 ? "herbst" : "winter";
}

/** Points a recipe needs to fit the season: one food of a short season, or two of longer. */
export const FITS_AT = 2;
/** Points the tag of the season gives, the way the household or the model described it. */
const TAG_POINTS = 2;

/**
 * How well a recipe fits the season, from the foods it is made with and its season tag.
 * A recipe that needs something of a short season outside it does not fit, whatever else is
 * in it: strawberries in November.
 */
export function seasonFit(
  foods: readonly SeasonalFood[],
  tags: readonly string[],
  month: Month,
): SeasonFit {
  const ripe = [...new Map(foods.map((food) => [food.key, food])).values()]
    .filter((food) => availability(food, month) === "fresh")
    .sort((a, b) => seasonWeight(b) - seasonWeight(a));
  const points =
    ripe.reduce((sum, food) => sum + seasonWeight(food), 0) +
    (tags.includes(seasonTagOf(month)) ? TAG_POINTS : 0);
  const outside = foods.some((food) => isOutOfSeason(food, month));
  return {
    points,
    fits: !outside && points >= FITS_AT,
    foods: ripe.filter((food) => seasonWeight(food) >= 1).map((food) => food.name),
  };
}

/** One month of the calendar, for the page that shows it. */
export interface MonthInSeason {
  month: Month;
  /** Harvested from this month on: it was not last month. */
  arriving: SeasonalFood[];
  /** Harvested now, and still next month. */
  ripe: SeasonalFood[];
  /** The last month of its harvest. */
  leaving: SeasonalFood[];
  /** From storage. */
  stored: SeasonalFood[];
}

export function monthInSeason(calendar: readonly SeasonalFood[], month: Month): MonthInSeason {
  const byName = (a: SeasonalFood, b: SeasonalFood) => a.name.localeCompare(b.name, "de");
  const fresh = calendar.filter((food) => availability(food, month) === "fresh").sort(byName);
  const before = nextMonth(month, -1);
  const after = nextMonth(month);
  // A food harvested all year round neither arrives nor leaves.
  const allYear = (food: SeasonalFood) => food.fresh.length === 12;
  const arriving = fresh.filter((food) => !allYear(food) && !food.fresh.includes(before));
  const leaving = fresh.filter(
    (food) => !allYear(food) && !food.fresh.includes(after) && !arriving.includes(food),
  );
  return {
    month,
    arriving,
    leaving,
    ripe: fresh.filter((food) => !arriving.includes(food) && !leaving.includes(food)),
    stored: calendar.filter((food) => availability(food, month) === "stored").sort(byName),
  };
}

/**
 * The months of a food in words, the way a calendar on the wall says them: "Juli bis
 * Oktober", the harvest that runs over the new year as one stretch, "November bis Februar".
 */
export function monthsText(months: readonly Month[]): string {
  if (months.length === 0) return "";
  if (months.length === 12) return "das ganze Jahr";
  const set = new Set(months);
  // Start where a stretch starts: a month whose month before is not in it.
  const starts = MONTHS.filter((month) => set.has(month) && !set.has(nextMonth(month, -1)));
  return starts
    .map((start) => {
      let end = start;
      while (set.has(nextMonth(end))) end = nextMonth(end);
      return start === end ? MONTH_NAME[start] : `${MONTH_NAME[start]} bis ${MONTH_NAME[end]}`;
    })
    .join(", ");
}

/** An ingredient of the catalog with its names. */
export interface NamedIngredient {
  id: string;
  name: string;
  synonyms: readonly string[];
}

/** Per ingredient of the catalog that the calendar knows, its food. */
export function foodsOfCatalog(
  calendar: readonly SeasonalFood[],
  catalog: readonly NamedIngredient[],
): Map<string, SeasonalFood> {
  const foods = new Map<string, SeasonalFood>();
  for (const ingredient of catalog) {
    const food = foodFor(calendar, [ingredient.name, ...ingredient.synonyms]);
    if (food) foods.set(ingredient.id, food);
  }
  return foods;
}

/** Per recipe, the foods of the calendar it is made with, from its ingredient lines. */
export function foodsByRecipe(
  foods: ReadonlyMap<string, SeasonalFood>,
  lines: readonly { recipe_id: string; ingredient_id: string | null }[],
): Map<string, SeasonalFood[]> {
  const byRecipe = new Map<string, SeasonalFood[]>();
  for (const line of lines) {
    const food = line.ingredient_id ? foods.get(line.ingredient_id) : undefined;
    if (!food) continue;
    const own = byRecipe.get(line.recipe_id) ?? [];
    if (!own.includes(food)) own.push(food);
    byRecipe.set(line.recipe_id, own);
  }
  return byRecipe;
}
