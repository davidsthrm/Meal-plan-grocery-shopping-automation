import "server-only";
import { searchKey, type RecipeFilter } from "@/domain/library/filter";
import {
  nearlyContains,
  searchRecipes,
  searchWords,
  type SearchResult,
} from "@/domain/library/search";
import type { Category, ProteinType, RecipeSummary } from "@/domain/library/summary";
import { must, type Db } from "./catalog";

/**
 * The recipe library as the pages need it. Which household is decided by row level
 * security: the client only sees its own.
 */

/** The API returns at most this many rows per request. */
const PAGE = 1000;

/** Loads every row of a query that can have more than one page of them. */
export async function allRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const loaded = must(await page(from, from + PAGE - 1), what);
    rows.push(...loaded);
    if (loaded.length < PAGE) return rows;
  }
}

export interface Library {
  /** Every approved recipe. */
  recipes: RecipeSummary[];
  /** The household's categories, in their order. */
  categories: Category[];
  books: string[];
}

export async function loadLibrary(db: Db): Promise<Library> {
  const [rows, tags] = await Promise.all([
    allRows(
      (from, to) =>
        db
          .from("recipe")
          .select(
            "id, title, kind, source_book, source_page, servings_min, servings_max, servings_unit, prep_minutes, protein_type, is_favorite, created_at",
          )
          .eq("status", "approved")
          .order("id")
          .range(from, to),
      "load recipes",
    ),
    db
      .from("tag")
      .select("id, key, name")
      .eq("group_name", "Kategorie")
      .not("key", "is", null)
      .order("sort_order"),
  ]);
  const categoryTags = must(tags, "load categories");
  const keyOf = new Map(categoryTags.map((tag) => [tag.id, tag.key as string]));
  const links =
    categoryTags.length === 0
      ? []
      : await allRows(
          (from, to) =>
            db
              .from("recipe_tag")
              .select("recipe_id, tag_id")
              .in("tag_id", [...keyOf.keys()])
              .order("recipe_id")
              .range(from, to),
          "load recipe categories",
        );
  const categoryOf = new Map(links.map((link) => [link.recipe_id, keyOf.get(link.tag_id) ?? null]));

  const recipes = rows.map((row): RecipeSummary => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    category: categoryOf.get(row.id) ?? null,
    proteinType: row.protein_type as ProteinType | null,
    prepMinutes: row.prep_minutes,
    isFavorite: row.is_favorite,
    sourceBook: row.source_book,
    sourcePage: row.source_page,
    servings:
      row.servings_min !== null && row.servings_max !== null
        ? { min: row.servings_min, max: row.servings_max, unit: row.servings_unit }
        : null,
    addedOn: row.created_at.slice(0, 10),
  }));
  return {
    recipes,
    categories: categoryTags.map((tag) => ({ key: tag.key as string, name: tag.name })),
    books: [...new Set(recipes.flatMap((recipe) => recipe.sourceBook ?? []))].sort((a, b) =>
      a.localeCompare(b, "de"),
    ),
  };
}

/** Shorter words would match half the catalog ("ei" is in "Reis" and "Weizenmehl"). */
const MIN_INGREDIENT_WORD = 3;
/** A word that names more ingredients than this names no ingredient in particular. */
const MAX_INGREDIENTS_PER_WORD = 150;

/**
 * Per word of a search, the recipes with an ingredient of that name: its catalog name, one of
 * its other names, or the printed line of an ingredient the catalog does not know yet. A word
 * that names no ingredient as written may be one typing mistake away from one.
 */
async function ingredientHits(db: Db, text: string): Promise<Map<string, Set<string>>> {
  const printed = text.split(/[\s,;/]+/).filter(Boolean);
  const words = searchWords(text).filter((word) => word.length >= MIN_INGREDIENT_WORD);
  const hits = new Map<string, Set<string>>();
  if (words.length === 0) return hits;

  const ingredients = must(
    await db.from("ingredient").select("id, name, synonyms"),
    "load ingredients",
  ).map((ingredient) => ({
    id: ingredient.id,
    names: [ingredient.name, ...ingredient.synonyms].map(searchKey),
  }));

  await Promise.all(
    words.map(async (word) => {
      const named = (fits: (name: string) => boolean) =>
        ingredients.filter((ingredient) => ingredient.names.some(fits)).map((i) => i.id);
      let ids = named((name) => name.includes(word));
      if (ids.length === 0) ids = named((name) => nearlyContains(name, word));
      // As typed, and only letters, digits and spaces, so nothing in the pattern is a wildcard.
      const typed = (printed.find((entry) => searchKey(entry) === word) ?? "").replace(
        /[^\p{L}\p{N} ]/gu,
        "",
      );
      const [known, unknown] = await Promise.all([
        ids.length === 0
          ? []
          : allRows(
              (from, to) =>
                db
                  .from("recipe_ingredient")
                  .select("recipe_id")
                  .in("ingredient_id", ids.slice(0, MAX_INGREDIENTS_PER_WORD))
                  .order("id")
                  .range(from, to),
              "find recipes by ingredient",
            ),
        typed.length < MIN_INGREDIENT_WORD
          ? []
          : allRows(
              (from, to) =>
                db
                  .from("recipe_ingredient")
                  .select("recipe_id")
                  .is("ingredient_id", null)
                  .ilike("original_text", `%${typed}%`)
                  .order("id")
                  .range(from, to),
              "find recipes by printed ingredient",
            ),
      ]);
      hits.set(word, new Set([...known, ...unknown].map((row) => row.recipe_id)));
    }),
  );
  return hits;
}

/** Searches the library with a filter: what fits, best first, and what fits in part. */
export async function searchLibrary(
  db: Db,
  library: Library,
  filter: RecipeFilter,
): Promise<SearchResult> {
  const names = new Map(library.categories.map((category) => [category.key, category.name]));
  return searchRecipes(library.recipes, filter, {
    ingredientHits: filter.text.trim() === "" ? undefined : await ingredientHits(db, filter.text),
    categoryName: (key) => names.get(key),
  });
}
