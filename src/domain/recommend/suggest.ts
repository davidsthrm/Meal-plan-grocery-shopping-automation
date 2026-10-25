import { daysBetween, isoWeekday, type IsoDate } from "../dates";
import { LONG_AGO_DAYS } from "../library/discover";
import { dishOf, type Pictogram } from "../library/pictogram";
import { isMeal, suitsMeal, type History, type RecipeSummary } from "../library/summary";
import { effortOf, type Effort, type TagGroup } from "../library/tags";
import { byDayAndMeal, type Meal } from "../plan";
import { rank } from "../rank";
import { groupOf, isFull, missing, withMeal, type BalanceGroup, type BalanceLine } from "./balance";

/**
 * Suggestions for the week plan. Rule based and explainable: a recipe is suggested because
 * someone wants to cook it, because it fills a gap in the week's balance, because what it is
 * made with is in season, because it is a favourite, or because the household has not cooked
 * it for a long time or never. What the week has already, the same main ingredient or the
 * same kind of dish, counts against it. Every suggestion says why. What takes long is kept
 * for the weekend, and favourites are no more than a share of what is suggested.
 */

export type Reason =
  /** Someone marked it as "want to cook this". */
  | { kind: "wanted" }
  /** The week still lacks meals of this group. */
  | { kind: "fills_gap"; group: BalanceGroup }
  /** What it is made with is harvested now: the strongest of those foods, two at most. */
  | { kind: "in_season"; foods: string[] }
  | { kind: "favorite" }
  /** Cooked before, but not for this many weeks. */
  | { kind: "long_ago"; weeks: number }
  /** Never on a plan. */
  | { kind: "never_cooked" }
  /** Counts against it: on the plan only this many weeks ago. */
  | { kind: "recent"; weeks: number }
  /** Counts against it: the week already has as many meals of this group as it should. */
  | { kind: "group_full"; group: BalanceGroup }
  /** Counts against it: the week has a meal with this main ingredient or kind of dish. */
  | { kind: "repeats"; tag: string }
  /** Counts against it: it needs something of a short season outside it. */
  | { kind: "out_of_season"; foods: string[] };

export interface Suggestion {
  recipe: RecipeSummary;
  score: number;
  /** What speaks for it, the strongest first, then what speaks against it. */
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
  /**
   * The tags a week should not repeat, the main ingredient and the kind of dish, by ref with
   * their names (`varietyTags`). Without them nothing counts as a repeat.
   */
  variety?: ReadonlyMap<string, string>;
  /** Those of them the recipes already on this week's plan have (`tagsOfWeek`). */
  usedTags?: ReadonlySet<string>;
}

/** A dish from the last weeks is not suggested again so soon. */
export const RECENT_WEEKS = 4;

/**
 * A wish outweighs everything else that speaks for or against a recipe. The season and a
 * favourite weigh the same; a dish never cooked gets the nudge one not cooked for long gets.
 */
const POINTS = {
  wanted: 8,
  fillsGap: 3,
  inSeason: 2,
  favorite: 2,
  longAgo: 1,
  neverCooked: 1,
  recent: -3,
  groupFull: -4,
  repeats: -2,
  outOfSeason: -3,
} as const;

/** How many foods a reason names: "Passt zur Saison: Kürbis, Lauch". */
const NAMED_FOODS = 2;

/** The groups of tags whose repeat in a week counts against a recipe. */
export const VARIETY_GROUPS: readonly string[] = ["Hauptzutat", "Gericht"];

/** The tags of `VARIETY_GROUPS`, by ref with their names. */
export function varietyTags(groups: readonly TagGroup[]): Map<string, string> {
  return new Map(
    groups
      .filter((group) => VARIETY_GROUPS.includes(group.name))
      .flatMap((group) => group.tags.map((tag) => [tag.ref, tag.name] as const)),
  );
}

/** The variety tags the given recipes have: what a week holds already. */
export function tagsOfWeek(
  recipes: readonly Pick<RecipeSummary, "tags">[],
  variety: ReadonlyMap<string, string>,
): Set<string> {
  return new Set(recipes.flatMap((recipe) => recipe.tags.filter((tag) => variety.has(tag))));
}

/** How well a recipe fits the week, and why. */
export function scoreRecipe(recipe: RecipeSummary, context: SuggestContext): Suggestion {
  const pros: Reason[] = [];
  const cons: Reason[] = [];
  let score = 0;
  if (recipe.wanted) {
    score += POINTS.wanted;
    pros.push({ kind: "wanted" });
  }

  // A cake for coffee fills no gap in the week's meals.
  const group = isMeal(recipe) ? groupOf(recipe.proteinType) : null;
  const line = context.balance.find((entry) => entry.group === group);
  if (group && line) {
    if (missing(line) > 0) {
      score += POINTS.fillsGap;
      pros.push({ kind: "fills_gap", group });
    } else if (isFull(line)) {
      score += POINTS.groupFull;
      cons.push({ kind: "group_full", group });
    }
  }
  if (recipe.season?.fits) {
    score += POINTS.inSeason;
    pros.push({ kind: "in_season", foods: recipe.season.foods.slice(0, NAMED_FOODS) });
  } else if (recipe.season?.outside) {
    score += POINTS.outOfSeason;
    cons.push({ kind: "out_of_season", foods: recipe.season.outside.slice(0, NAMED_FOODS) });
  }
  if (recipe.isFavorite) {
    score += POINTS.favorite;
    pros.push({ kind: "favorite" });
  }
  const last = context.history.get(recipe.id);
  if (last === undefined) {
    score += POINTS.neverCooked;
    pros.push({ kind: "never_cooked" });
  } else {
    const days = daysBetween(last, context.weekStart);
    const weeks = Math.max(1, Math.round(days / 7));
    if (days < RECENT_WEEKS * 7) {
      score += POINTS.recent;
      cons.push({ kind: "recent", weeks });
    } else if (days >= LONG_AGO_DAYS) {
      score += POINTS.longAgo;
      pros.push({ kind: "long_ago", weeks });
    }
  }
  if (context.variety && context.usedTags) {
    for (const tag of recipe.tags) {
      const name = context.variety.get(tag);
      if (name !== undefined && context.usedTags.has(tag)) {
        score += POINTS.repeats;
        cons.push({ kind: "repeats", tag: name });
      }
    }
  }
  return { recipe, score, reasons: [...pros, ...cons] };
}

/**
 * The share of suggestions that may be favourites. Favourites weigh more than other recipes,
 * and without a limit they were all the household was offered. A favourite someone wants to
 * cook is a wish and does not count.
 */
export const FAVORITE_SHARE = 1 / 3;

/** A favourite that is not also a wish: what `FAVORITE_SHARE` limits. */
export function isPlainFavorite(recipe: Pick<RecipeSummary, "isFavorite" | "wanted">): boolean {
  return recipe.isFavorite && !recipe.wanted;
}

/**
 * Puts a list of suggestions, best first, in an order in which favourites are no more than
 * their share at any length: of the first three one, of the first six two. Each keeps its
 * place among its own kind; favourites left over come at the end.
 */
export function mixFavorites<T extends { recipe: RecipeSummary }>(
  list: readonly T[],
  share = FAVORITE_SHARE,
): T[] {
  // Places in the list, so that "the better one" needs no search.
  const favorites: number[] = [];
  const others: number[] = [];
  list.forEach((entry, at) => (isPlainFavorite(entry.recipe) ? favorites : others).push(at));
  const mixed: T[] = [];
  let f = 0;
  let o = 0;
  while (f < favorites.length || o < others.length) {
    // A favourite comes next where it is the better one and its share allows another.
    const allowed = f < Math.ceil((mixed.length + 1) * share);
    const better = o === others.length || favorites[f] < others[o];
    const favorite = f < favorites.length && (o === others.length || (allowed && better));
    mixed.push(list[favorite ? favorites[f++] : others[o++]]);
  }
  return mixed;
}

export interface OpenSlot {
  date: IsoDate;
  meal: Meal;
}

/** What is eaten cold in the evening and is no work to speak of. */
const COLD = new Set(["salat", "vesper"]);

/**
 * Dishes too filling for the evening, on any day: pasta, rice, potatoes, a casserole. What
 * kind of dish a recipe is is read as for its pictogram, so a pasta salad is a salad. A
 * soup, a wrap or toast from the oven is light enough.
 */
const HEAVY: ReadonlySet<Pictogram> = new Set(["pasta", "reis", "kartoffel", "auflauf"]);

/**
 * Whether a recipe fits the meal of the day. The evening is light: nothing heavy is
 * suggested for it. From Monday to Friday nobody cooks for hours either: lunch takes what is
 * quick or fits a normal day, the evening only what is quick or cold. A recipe whose effort
 * is not known is kept for the weekend. Planning anything by hand is always possible.
 */
export function suitsDay(
  recipe: Pick<RecipeSummary, "title" | "category" | "proteinType" | "tags" | "prepMinutes">,
  slot: OpenSlot,
): boolean {
  const { heavy, effort } = traitsOf(recipe);
  if (slot.meal === "dinner" && heavy) return false;
  if (slot.meal === "coffee" || isoWeekday(slot.date) > 5) return true;
  if (slot.meal === "lunch") return effort === "schnell" || effort === "alltag";
  if (recipe.category !== null && COLD.has(recipe.category)) return effort !== "aufwendig";
  return effort === "schnell";
}

/**
 * What `suitsDay` asks of a recipe, worked out once per recipe: its dish is read from its
 * title. A week's suggestions ask it of every recipe for every meal, and reading the titles
 * again each time made the week plan wait (October 2026).
 */
const traits = new WeakMap<object, { heavy: boolean; effort: Effort | null }>();

function traitsOf(recipe: Pick<RecipeSummary, "title" | "category" | "tags" | "prepMinutes">): {
  heavy: boolean;
  effort: Effort | null;
} {
  let known = traits.get(recipe);
  if (!known) {
    known = { heavy: HEAVY.has(dishOf(recipe) ?? "teller"), effort: effortOf(recipe) };
    traits.set(recipe, known);
  }
  return known;
}

/**
 * The best recipes for one meal of one day, best first: by score, then by the seed's order,
 * then by id, with favourites no more than their share (`mixFavorites`). Each recipe's place
 * in the seed's order is worked out once, and the single best one, which is what the week
 * asks for, is found without sorting the library.
 */
export function suggest(
  recipes: readonly RecipeSummary[],
  slot: OpenSlot,
  context: SuggestContext,
  count: number,
): Suggestion[] {
  const scored = recipes
    .filter(
      (recipe) =>
        suitsMeal(recipe, slot.meal) && suitsDay(recipe, slot) && !context.planned.has(recipe.id),
    )
    .map((recipe) => ({
      suggestion: scoreRecipe(recipe, context),
      at: rank(context.seed, recipe.id),
    }));
  const before = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.suggestion.score - a.suggestion.score ||
    a.at - b.at ||
    a.suggestion.recipe.id.localeCompare(b.suggestion.recipe.id);
  if (count === 1) {
    const best = scored.reduce<(typeof scored)[number] | undefined>(
      (top, entry) => (top === undefined || before(entry, top) < 0 ? entry : top),
      undefined,
    );
    return best ? [best.suggestion] : [];
  }
  // A list is mixed before it is cut: favourites further down make room for other recipes.
  return mixFavorites(scored.sort(before).map((entry) => entry.suggestion)).slice(0, count);
}

/**
 * One suggestion for every open meal of a week, so that the suggestions add up to a balanced
 * week: each one is chosen as if the ones before it had been accepted, mostly in the order of
 * the week. A wish goes to the first meal it suits. A meal that could run out, with fewer
 * suitable recipes left than meals still open, is chosen for before the others: in a small
 * cookbook the lunches took the salad and the fish, and a workday evening, which takes only
 * what is light and quick, was left with a third meat dish. Favourites fill no more than their
 * share of the week (`FAVORITE_SHARE`, those on the plan already counted), and the main
 * ingredient and kind of dish of each pick count as the week's for the next. Returns them in
 * the order of the slots; a slot nothing is left for is missing. What each one says for
 * itself is said of the week as it is planned (`context`), not of the order they were chosen
 * in.
 */
export function suggestWeek(
  recipes: readonly RecipeSummary[],
  open: readonly OpenSlot[],
  context: SuggestContext,
): (OpenSlot & { suggestion: Suggestion })[] {
  let balance = context.balance;
  const planned = new Set(context.planned);
  const usedTags = new Set(context.usedTags);
  const slots = [...open].sort(byDayAndMeal);
  const chosen = new Map<OpenSlot, Suggestion>();
  const choices = (slot: OpenSlot) =>
    recipes.filter(
      (recipe) => suitsMeal(recipe, slot.meal) && suitsDay(recipe, slot) && !planned.has(recipe.id),
    ).length;

  // How many more favourites the week takes: its share of every meal, planned or open.
  const onPlan = recipes.filter((recipe) => context.planned.has(recipe.id));
  let favoritesLeft =
    Math.ceil((context.planned.size + slots.length) * FAVORITE_SHARE) -
    onPlan.filter(isPlainFavorite).length;
  const withoutFavorites = recipes.filter((recipe) => !isPlainFavorite(recipe));

  // Each slot draws its own order, or two slots with the same needs would get the same dish.
  const best = (slot: OpenSlot) => {
    const among = (pool: readonly RecipeSummary[]) =>
      suggest(
        pool,
        slot,
        {
          ...context,
          balance,
          planned,
          usedTags,
          seed: `${context.seed}:${slot.date}:${slot.meal}`,
        },
        1,
      )[0] as Suggestion | undefined;
    // Once the favourites have their share, the others; a favourite only where nothing else
    // suits the meal.
    return favoritesLeft > 0 ? among(recipes) : (among(withoutFavorites) ?? among(recipes));
  };

  const waiting = [...slots];
  while (waiting.length > 0) {
    // A wish goes to the first meal it leads, as it does when that meal is asked about.
    let at = waiting.findIndex((slot) => best(slot)?.recipe.wanted);
    if (at === -1) {
      // Otherwise in the order of the week, unless a meal could run out: one with fewer
      // suitable recipes left than meals still open goes first, the tightest of them.
      at = 0;
      let least = waiting.length;
      waiting.forEach((slot, i) => {
        const left = choices(slot);
        if (left < least) [at, least] = [i, left];
      });
    }
    const [slot] = waiting.splice(at, 1);
    const suggestion = best(slot);
    if (!suggestion) continue;
    const recipe = suggestion.recipe;
    chosen.set(slot, scoreRecipe(recipe, context));
    planned.add(recipe.id);
    balance = withMeal(balance, groupOf(recipe.proteinType));
    if (isPlainFavorite(recipe)) favoritesLeft -= 1;
    if (context.variety) {
      for (const tag of tagsOfWeek([recipe], context.variety)) usedTags.add(tag);
    }
  }
  return slots.flatMap((slot) => {
    const suggestion = chosen.get(slot);
    return suggestion ? [{ ...slot, suggestion }] : [];
  });
}

/** How many open meals offer a suggestion unasked. */
export const HINTS = 5;
/** What an idea needs to be offered unasked: more than "never cooked". */
export const HINT_SCORE = 2;
/** How many of those may be favourites. */
export const FAVORITE_HINTS = 2;

/**
 * The meals that offer their suggestion unasked, as "<date>.<meal>": those with the most to
 * say for them, at most `FAVORITE_HINTS` of them favourites, and among equals not simply the
 * first days of the week (the seed decides).
 */
export function hintedMeals(
  picks: readonly (OpenSlot & { suggestion: Suggestion })[],
  seed: string,
): Set<string> {
  const ranked = picks
    .filter((pick) => pick.suggestion.score >= HINT_SCORE)
    .map((pick) => ({
      key: `${pick.date}.${pick.meal}`,
      score: pick.suggestion.score,
      favorite: isPlainFavorite(pick.suggestion.recipe),
    }))
    .sort((a, b) => b.score - a.score || rank(seed, a.key) - rank(seed, b.key));
  const hinted = new Set<string>();
  let favorites = 0;
  for (const pick of ranked) {
    if (hinted.size === HINTS) break;
    if (pick.favorite && favorites === FAVORITE_HINTS) continue;
    if (pick.favorite) favorites += 1;
    hinted.add(pick.key);
  }
  return hinted;
}
