import "server-only";
import { searchKey } from "@/domain/library/filter";
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

/** Shorter searches would match half the catalog ("ei" is in "Reis" and "Weizenmehl"). */
const MIN_INGREDIENT_SEARCH = 3;

/**
 * The recipes that contain an ingredient whose name, or one of its other names, contains the
 * searched text. Lines the catalog does not know yet are searched as printed.
 */
export async function recipesWithIngredient(db: Db, text: string): Promise<Set<string>> {
  const key = searchKey(text);
  const hits = new Set<string>();
  if (key.length < MIN_INGREDIENT_SEARCH) return hits;

  const ingredients = must(
    await db.from("ingredient").select("id, name, synonyms"),
    "load ingredients",
  );
  const ids = ingredients
    .filter((ingredient) =>
      [ingredient.name, ...ingredient.synonyms].some((name) => searchKey(name).includes(key)),
    )
    .map((ingredient) => ingredient.id);
  // Only letters, digits and spaces reach the pattern, so nothing in it is a wildcard.
  const printed = text.replace(/[^\p{L}\p{N} ]/gu, " ").trim();

  const [known, unknown] = await Promise.all([
    ids.length === 0
      ? []
      : allRows(
          (from, to) =>
            db
              .from("recipe_ingredient")
              .select("recipe_id")
              .in("ingredient_id", ids.slice(0, 150))
              .order("id")
              .range(from, to),
          "find recipes by ingredient",
        ),
    printed.length < MIN_INGREDIENT_SEARCH
      ? []
      : allRows(
          (from, to) =>
            db
              .from("recipe_ingredient")
              .select("recipe_id")
              .is("ingredient_id", null)
              .ilike("original_text", `%${printed}%`)
              .order("id")
              .range(from, to),
          "find recipes by printed ingredient",
        ),
  ]);
  for (const row of [...known, ...unknown]) hits.add(row.recipe_id);
  return hits;
}
