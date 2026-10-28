import "server-only";
import { searchKey, type RecipeFilter } from "@/domain/library/filter";
import {
  nearlyContains,
  searchRecipes,
  searchWords,
  type SearchResult,
} from "@/domain/library/search";
import { ingredientKeys, type SearchIndex } from "@/domain/library/search-index";
import { knownSources, type KnownSource } from "@/domain/library/source";
import type { Category, ProteinType, RecipeSummary } from "@/domain/library/summary";
import { groupTags, TAG_GROUPS, type Tag, type TagGroup } from "@/domain/library/tags";
import { withHistory } from "@/domain/library/discover";
import { foodsByRecipe, foodsOfCatalog, monthOf } from "@/domain/season/calendar";
import { today } from "@/lib/today";
import { allRows, loadIngredientNames, must, type Db } from "./catalog";
import { loadHistory } from "./planning/week";
import { CALENDAR, withSeason } from "./season";

/**
 * The recipe library as the pages need it. Which household is decided by row level
 * security: the client only sees its own.
 */

export interface Library {
  /** Every approved recipe. */
  recipes: RecipeSummary[];
  /** The household's categories, in their order. */
  categories: Category[];
  books: string[];
  /** Every book with its editions; a cookbook has none. */
  sources: KnownSource[];
  /** What else recipes are described by, in groups: effort, kind of dish, cuisine and so on. */
  tagGroups: TagGroup[];
}

/** The id of the row a tag is stored in, for the tags a recipe can be described by. */
export async function loadTagIds(db: Db): Promise<Map<string, string>> {
  const rows = must(await db.from("tag").select("id, key, group_name"), "load tags");
  return new Map(
    rows
      .filter((row) => (TAG_GROUPS as readonly string[]).includes(row.group_name))
      .map((row) => [row.key ?? row.id, row.id]),
  );
}

export async function loadLibrary(db: Db): Promise<Library> {
  // The links of recipes and tags are read alongside the recipes and the tags, not after the
  // tags: what a link names that is no category and no described tag is passed over below.
  const [rows, tags, links] = await Promise.all([
    allRows(
      (from, to) =>
        db
          .from("recipe")
          .select(
            "id, title, kind, source_book, source_edition, source_page, servings_min, servings_max, servings_unit, prep_minutes, protein_type, is_favorite, wanted_at, created_at",
          )
          .eq("status", "approved")
          .order("id")
          .range(from, to),
      "load recipes",
    ),
    db.from("tag").select("id, key, name, group_name").order("sort_order").order("name"),
    allRows(
      (from, to) =>
        db
          .from("recipe_tag")
          .select("recipe_id, tag_id")
          .order("recipe_id")
          .order("tag_id")
          .range(from, to),
      "load recipe tags",
    ),
  ]);
  const allTags = must(tags, "load tags");
  const categoryTags = allTags.filter((tag) => tag.group_name === "Kategorie" && tag.key !== null);
  const keyOf = new Map(categoryTags.map((tag) => [tag.id, tag.key as string]));
  // A tag the household made has no key; the app then goes by its id.
  const described: (Tag & { id: string })[] = allTags
    .filter((tag) => (TAG_GROUPS as readonly string[]).includes(tag.group_name))
    .map((tag) => ({ id: tag.id, ref: tag.key ?? tag.id, name: tag.name, group: tag.group_name }));
  const refOf = new Map(described.map((tag) => [tag.id, tag.ref]));
  const categoryOf = new Map<string, string>();
  const tagsOf = new Map<string, string[]>();
  for (const link of links) {
    const category = keyOf.get(link.tag_id);
    if (category) categoryOf.set(link.recipe_id, category);
    const ref = refOf.get(link.tag_id);
    if (ref) tagsOf.set(link.recipe_id, [...(tagsOf.get(link.recipe_id) ?? []), ref]);
  }

  const recipes = rows.map((row): RecipeSummary => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    category: categoryOf.get(row.id) ?? null,
    proteinType: row.protein_type as ProteinType | null,
    prepMinutes: row.prep_minutes,
    isFavorite: row.is_favorite,
    sourceBook: row.source_book,
    sourceEdition: row.source_edition,
    sourcePage: row.source_page,
    servings:
      row.servings_min !== null && row.servings_max !== null
        ? { min: row.servings_min, max: row.servings_max, unit: row.servings_unit }
        : null,
    addedOn: row.created_at.slice(0, 10),
    tags: tagsOf.get(row.id) ?? [],
    wanted: row.wanted_at !== null,
  }));
  return {
    recipes,
    categories: categoryTags.map((tag) => ({ key: tag.key as string, name: tag.name })),
    sources: knownSources(
      recipes.map((recipe) => ({ book: recipe.sourceBook, edition: recipe.sourceEdition })),
    ),
    books: [...new Set(recipes.flatMap((recipe) => recipe.sourceBook ?? []))].sort((a, b) =>
      a.localeCompare(b, "de"),
    ),
    tagGroups: groupTags(described.map(({ ref, name, group }) => ({ ref, name, group }))),
  };
}

/**
 * The library as the browser searches it while someone types: the recipes, and per recipe
 * which ingredients it uses.
 */
export async function loadSearchIndex(db: Db): Promise<SearchIndex> {
  const now = today();
  const [library, catalog, lines, history] = await Promise.all([
    loadLibrary(db),
    loadIngredientNames(db),
    allRows(
      (from, to) =>
        db
          .from("recipe_ingredient")
          .select("recipe_id, ingredient_id, original_text")
          .order("id")
          .range(from, to),
      "load ingredient lines",
    ),
    loadHistory(db, now),
  ]);
  // The filters "Passt zur Saison" and "Lange nicht gekocht" work while typing too.
  const foods = foodsByRecipe(foodsOfCatalog(CALENDAR, catalog), lines);
  const recipes = withHistory(withSeason(library.recipes, foods, monthOf(now)), history, now);
  const at = new Map(catalog.map((ingredient, position) => [ingredient.id, position]));
  const uses = new Map<string, Set<number>>();
  const loose = new Map<string, string[]>();
  for (const line of lines) {
    const position = line.ingredient_id ? at.get(line.ingredient_id) : undefined;
    if (position !== undefined) {
      uses.set(line.recipe_id, (uses.get(line.recipe_id) ?? new Set()).add(position));
    } else if (line.original_text) {
      loose.set(line.recipe_id, [
        ...(loose.get(line.recipe_id) ?? []),
        searchKey(line.original_text),
      ]);
    }
  }
  return {
    recipes,
    categories: library.categories,
    tags: library.tagGroups.flatMap((group) =>
      group.tags.map((tag) => ({ ref: tag.ref, name: tag.name })),
    ),
    ingredients: catalog.map((ingredient) =>
      ingredientKeys([ingredient.name, ...ingredient.synonyms]),
    ),
    uses: library.recipes.map((recipe) => [...(uses.get(recipe.id) ?? [])]),
    loose: library.recipes.map((recipe) => (loose.get(recipe.id) ?? []).join(" ")),
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

  const ingredients = (await loadIngredientNames(db)).map((ingredient) => ({
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
  const tagNames = new Map(
    library.tagGroups.flatMap((group) => group.tags.map((tag) => [tag.ref, tag.name])),
  );
  return searchRecipes(library.recipes, filter, {
    ingredientHits: filter.text.trim() === "" ? undefined : await ingredientHits(db, filter.text),
    categoryName: (key) => names.get(key),
    tagName: (ref) => tagNames.get(ref),
  });
}

/** What "Was ist noch da?" offers and matches: foods to tap, and which recipes use them. */
export interface FridgeLibrary {
  /** The household's names of the foods recipes use, without what is always at home. */
  foods: string[];
  /** Per recipe, which of `foods` it uses, by their place. */
  recipes: (RecipeSummary & { uses: number[] })[];
}

/**
 * The library as "Was ist noch da?" needs it. Pantry staples are left out: salt and oil are
 * always there and decide nothing. A food no recipe uses is not offered.
 */
export async function loadFridge(db: Db): Promise<FridgeLibrary> {
  const [library, catalog, lines] = await Promise.all([
    loadLibrary(db),
    allRows(
      (from, to) =>
        db
          .from("ingredient")
          .select("id, name, is_pantry_staple")
          .order("name")
          .order("id")
          .range(from, to),
      "load the catalog for the fridge",
    ),
    allRows(
      (from, to) =>
        db
          .from("recipe_ingredient")
          .select("recipe_id, ingredient_id")
          .not("ingredient_id", "is", null)
          .order("id")
          .range(from, to),
      "load what recipes use",
    ),
  ]);
  const staple = new Set(catalog.filter((food) => food.is_pantry_staple).map((food) => food.id));
  const used = new Map<string, Set<string>>();
  for (const line of lines) {
    if (!line.ingredient_id || staple.has(line.ingredient_id)) continue;
    used.set(line.recipe_id, (used.get(line.recipe_id) ?? new Set()).add(line.ingredient_id));
  }
  const usedAtAll = new Set([...used.values()].flatMap((foods) => [...foods]));
  const foods = catalog.filter((food) => usedAtAll.has(food.id));
  const at = new Map(foods.map((food, position) => [food.id, position]));
  return {
    foods: foods.map((food) => food.name),
    recipes: library.recipes.map((recipe) => ({
      ...recipe,
      uses: [...(used.get(recipe.id) ?? [])].map((id) => at.get(id)!),
    })),
  };
}
