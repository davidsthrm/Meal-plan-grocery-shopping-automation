import type { IsoDate } from "../dates";
import { byEdition } from "./source";
import type { History, RecipeSummary } from "./summary";

/**
 * The Regal: the family's cookbooks and magazines as a shelf, each saying how much of it was
 * cooked, and one of them opened to leaf through: what fits the season, what was never cooked
 * from it, what was. Browsing the way one does at the real shelf, where most of a book's
 * recipes have never been cooked (October 2026).
 */

export interface ShelfBook {
  name: string;
  recipes: number;
  /** Its recipes that were on a plan before today. */
  cooked: number;
  /** A magazine's editions, newest first; empty for a cookbook. */
  editions: string[];
}

/** Whether a recipe was on a plan before today. */
function wasCooked(recipe: RecipeSummary, history: History, today: IsoDate): boolean {
  const last = history.get(recipe.id);
  return last !== undefined && last < today;
}

/** Every cookbook and magazine of the library, by name, with how much of it was cooked. */
export function bookshelf(
  recipes: readonly RecipeSummary[],
  history: History,
  today: IsoDate,
): ShelfBook[] {
  const books = new Map<string, { recipes: number; cooked: number; editions: Set<string> }>();
  for (const recipe of recipes) {
    if (!recipe.sourceBook) continue;
    const book = books.get(recipe.sourceBook) ?? { recipes: 0, cooked: 0, editions: new Set() };
    book.recipes += 1;
    if (wasCooked(recipe, history, today)) book.cooked += 1;
    if (recipe.sourceEdition) book.editions.add(recipe.sourceEdition);
    books.set(recipe.sourceBook, book);
  }
  return [...books]
    .map(([name, book]) => ({
      name,
      recipes: book.recipes,
      cooked: book.cooked,
      editions: [...book.editions].sort((a, b) => byEdition(b, a)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** A book taken from the shelf, or one of its editions. */
export interface OpenBook {
  book: ShelfBook;
  /** The edition open, or null for the whole book. */
  edition: string | null;
  /** How many recipes are open: the book's, or the edition's. */
  total: number;
  cooked: number;
  /** What of it fits the season, the best fit first. */
  season: RecipeSummary[];
  /** What was never cooked from it, in the order of its pages. */
  never: RecipeSummary[];
  /** What was cooked from it, last cooked first, with the day. */
  known: { recipe: RecipeSummary; last: IsoDate }[];
}

/** By page, then by title: the order of the book itself. */
function byPage(a: RecipeSummary, b: RecipeSummary): number {
  return (
    (a.sourcePage ?? Number.MAX_SAFE_INTEGER) - (b.sourcePage ?? Number.MAX_SAFE_INTEGER) ||
    a.title.localeCompare(b.title, "de")
  );
}

/**
 * A book of the shelf opened: its recipes, or those of one edition, in three groups. Null
 * for a name the shelf does not have; an edition it does not have opens the whole book.
 */
export function openBook(
  recipes: readonly RecipeSummary[],
  shelf: readonly ShelfBook[],
  name: string,
  { edition, today, history }: { edition?: string | null; today: IsoDate; history: History },
): OpenBook | null {
  const book = shelf.find((entry) => entry.name === name);
  if (!book) return null;
  const issue = edition && book.editions.includes(edition) ? edition : null;
  const own = recipes.filter(
    (recipe) => recipe.sourceBook === name && (issue === null || recipe.sourceEdition === issue),
  );
  const known = own
    .filter((recipe) => wasCooked(recipe, history, today))
    .map((recipe) => ({ recipe, last: history.get(recipe.id)! }))
    .sort((a, b) => b.last.localeCompare(a.last) || byPage(a.recipe, b.recipe));
  return {
    book,
    edition: issue,
    total: own.length,
    cooked: known.length,
    season: own
      .filter((recipe) => recipe.season?.fits)
      .sort((a, b) => (b.season?.points ?? 0) - (a.season?.points ?? 0) || byPage(a, b)),
    never: own.filter((recipe) => !history.has(recipe.id)).sort(byPage),
    known,
  };
}

/** "12 von 136 gekocht": a share as a bar shows it, never empty where something was cooked. */
export function cookedShare(cooked: number, total: number): number {
  if (total === 0 || cooked === 0) return 0;
  return Math.max(0.04, cooked / total);
}
