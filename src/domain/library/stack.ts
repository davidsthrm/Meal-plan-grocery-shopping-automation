import { daysBetween, type IsoDate } from "../dates";
import { rank } from "../rank";
import { isMarked } from "./discover";
import { isMeal, type History, type RecipeSummary } from "./summary";

/**
 * The recipe stack of Entdecken: recipes nobody has cooked or marked yet, one card at a time.
 * Kept ("Vormerken") a recipe becomes a wish, put aside ("Nicht jetzt") it stays out of the
 * stack for a while, planned ("Einplanen") it goes onto the week. The family sorts a few
 * dozen recipes over a cup of coffee, and the week's suggestions start from what it kept.
 */

/** For this long a recipe put aside stays out of the stack. */
export const SKIP_DAYS = 28;

/** A new recipe is said to be new for this long. */
const NEW_DAYS = 14;

/**
 * The recipes of the stack, in an order that changes from day to day: meals, or those of one
 * category, that no plan ever held, that nobody marked, and that were not put aside lately.
 */
export function stackOf(
  recipes: readonly RecipeSummary[],
  {
    today,
    history,
    skipped,
    category = null,
  }: {
    today: IsoDate;
    history: History;
    /** The day each recipe was put aside. */
    skipped: ReadonlyMap<string, IsoDate>;
    category?: string | null;
  },
): RecipeSummary[] {
  return recipes
    .filter((recipe) => !isMarked(recipe) && !history.has(recipe.id))
    .filter((recipe) => (category ? recipe.category === category : isMeal(recipe)))
    .filter((recipe) => {
      const aside = skipped.get(recipe.id);
      return aside === undefined || daysBetween(aside, today) >= SKIP_DAYS;
    })
    .sort((a, b) => rank(today, a.id) - rank(today, b.id));
}

/** What a card says for its recipe: the season it fits, or that it is new. Null for nothing. */
export function stackWhy(recipe: RecipeSummary, today: IsoDate): string | null {
  const foods = recipe.season?.fits ? recipe.season.foods.slice(0, 3) : [];
  if (foods.length > 0) return `Passt zur Saison: ${foods.join(", ")}`;
  if (daysBetween(recipe.addedOn, today) <= NEW_DAYS) return "Neu im Kochbuch";
  return null;
}
