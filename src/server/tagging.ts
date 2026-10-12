import "server-only";
import { ALL_SUGGESTED, tagsFromSuggestion, type RecipeToTag } from "@/domain/library/tagging";
import { EFFORTS } from "@/domain/library/tags";
import { loadIngredientNames, must, type Db } from "./catalog";
import type { RecipeTagger } from "./import/read-recipe";

/** How many recipes one request describes. More and the answers get careless. */
export const TAG_BATCH = 15;
/** How many ids fit into the address of one request. */
const IDS_PER_REQUEST = 100;

export interface TaggingResult {
  /** How many recipes got their tags. */
  tagged: number;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Gives recipes the tags that describe them, for those among `recipeIds` that are not
 * described yet: every described recipe says how much work it is, so one without that tag
 * is waiting. At most one batch per call: the caller asks again while recipes are left.
 * Tags a recipe already has are kept; the household's own are never touched.
 */
export async function tagRecipes(
  db: Db,
  householdId: string,
  tag: RecipeTagger,
  recipeIds: readonly string[],
): Promise<TaggingResult> {
  const none = { tagged: 0, usage: { inputTokens: 0, outputTokens: 0 } };
  if (recipeIds.length === 0) return none;
  const tags = must(await db.from("tag").select("id, key, name, group_name"), "load tags");
  const suggested = tags.filter((row) => row.key !== null && ALL_SUGGESTED.includes(row.key));
  const idOf = new Map(suggested.map((row) => [row.key as string, row.id]));
  const effortIds = new Set(
    suggested
      .filter((row) => (EFFORTS as readonly string[]).includes(row.key as string))
      .map((row) => row.id),
  );
  const categoryName = new Map(
    tags.filter((row) => row.group_name === "Kategorie").map((row) => [row.id, row.name]),
  );

  // Find the first recipes that are not described yet.
  const waiting: string[] = [];
  const categoryOf = new Map<string, string>();
  for (let at = 0; at < recipeIds.length && waiting.length < TAG_BATCH; at += IDS_PER_REQUEST) {
    const part = recipeIds.slice(at, at + IDS_PER_REQUEST);
    const links = must(
      await db.from("recipe_tag").select("recipe_id, tag_id").in("recipe_id", part),
      "load tags of recipes",
    );
    const described = new Set<string>();
    for (const link of links) {
      if (effortIds.has(link.tag_id)) described.add(link.recipe_id);
      const category = categoryName.get(link.tag_id);
      if (category) categoryOf.set(link.recipe_id, category);
    }
    waiting.push(...part.filter((id) => !described.has(id)));
  }
  const batch = waiting.slice(0, TAG_BATCH);
  if (batch.length === 0) return none;

  const [recipes, lines, catalog] = await Promise.all([
    db.from("recipe").select("id, title, prep_minutes").in("id", batch),
    db
      .from("recipe_ingredient")
      .select("recipe_id, ingredient_id, original_text, position")
      .in("recipe_id", batch)
      .order("position"),
    loadIngredientNames(db),
  ]);
  const nameOf = new Map(catalog.map((ingredient) => [ingredient.id, ingredient.name]));
  const ingredientsOf = new Map<string, string[]>();
  for (const line of must(lines, "load ingredients of recipes")) {
    const name = (line.ingredient_id && nameOf.get(line.ingredient_id)) || line.original_text;
    ingredientsOf.set(line.recipe_id, [...(ingredientsOf.get(line.recipe_id) ?? []), name]);
  }
  const rows = must(recipes, "load recipes to tag");
  const described: RecipeToTag[] = rows.map((row) => ({
    title: row.title,
    category: categoryOf.get(row.id) ?? null,
    prepMinutes: row.prep_minutes,
    ingredients: ingredientsOf.get(row.id) ?? [],
  }));

  const { suggestions, usage } = await tag(described);
  const links = rows.flatMap((row, i) => {
    const suggestion = suggestions[i];
    if (!suggestion) return [];
    return tagsFromSuggestion(suggestion, row.prep_minutes).flatMap((key) => {
      const tag_id = idOf.get(key);
      return tag_id ? [{ household_id: householdId, recipe_id: row.id, tag_id }] : [];
    });
  });
  if (links.length > 0) {
    const stored = await db
      .from("recipe_tag")
      .upsert(links, { onConflict: "recipe_id,tag_id", ignoreDuplicates: true });
    if (stored.error) throw new Error(`store tags: ${stored.error.message}`);
  }
  return { tagged: new Set(links.map((link) => link.recipe_id)).size, usage };
}
