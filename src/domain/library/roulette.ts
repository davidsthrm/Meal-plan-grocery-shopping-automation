import { isMeal, type RecipeSummary } from "./summary";
import { effortOf, type Effort, type TagGroup } from "./tags";

/**
 * The recipe roulette: three reels, main ingredient, cuisine and effort, that stop on a
 * combination, and below them the recipes that are that combination: "Lachs · Asiatisch ·
 * Schnell". Only combinations with a meal behind them come up. A reel can be held; the
 * others spin again.
 */

export interface Combination {
  /** The tag of the main ingredient, the cuisine, and the effort. */
  main: string;
  cuisine: string;
  effort: Effort;
  /** The meals that are this combination. */
  recipes: string[];
}

/** What a spin keeps: the reels held, by their value. */
export interface Held {
  main?: string;
  cuisine?: string;
  effort?: Effort;
}

/** The key of a combination, as the address keeps it: "lachs.asiatisch.schnell". */
export function comboKey(combo: Pick<Combination, "main" | "cuisine" | "effort">): string {
  return `${combo.main}.${combo.cuisine}.${combo.effort}`;
}

/** Every combination of main ingredient, cuisine and effort that has meals behind it. */
export function combinations(
  recipes: readonly RecipeSummary[],
  groups: readonly TagGroup[],
): Combination[] {
  const refs = (name: string) =>
    new Set(groups.find((group) => group.name === name)?.tags.map((tag) => tag.ref) ?? []);
  const mains = refs("Hauptzutat");
  const cuisines = refs("Küche");
  const found = new Map<string, Combination>();
  for (const recipe of recipes) {
    const effort = effortOf(recipe);
    if (!isMeal(recipe) || effort === null) continue;
    for (const main of recipe.tags.filter((tag) => mains.has(tag))) {
      for (const cuisine of recipe.tags.filter((tag) => cuisines.has(tag))) {
        const key = comboKey({ main, cuisine, effort });
        const combo = found.get(key) ?? { main, cuisine, effort, recipes: [] };
        combo.recipes.push(recipe.id);
        found.set(key, combo);
      }
    }
  }
  return [...found.values()].sort((a, b) => comboKey(a).localeCompare(comboKey(b)));
}

/**
 * A spin: one of the combinations that keep what is held, drawn by `random` (0 to 1), and
 * another than the one shown where there is another. Null where nothing keeps what is held.
 */
export function spin(
  combos: readonly Combination[],
  held: Held,
  random: number,
  shown: string | null = null,
): Combination | null {
  const fitting = combos.filter(
    (combo) =>
      (held.main === undefined || combo.main === held.main) &&
      (held.cuisine === undefined || combo.cuisine === held.cuisine) &&
      (held.effort === undefined || combo.effort === held.effort),
  );
  const other = fitting.filter((combo) => comboKey(combo) !== shown);
  const pool = other.length > 0 ? other : fitting;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}
