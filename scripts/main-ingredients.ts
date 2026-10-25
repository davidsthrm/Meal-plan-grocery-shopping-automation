import { createClient } from "@supabase/supabase-js";
import {
  MAIN_INGREDIENT_NAME,
  MAIN_INGREDIENTS,
  mainIngredients,
  type MainIngredient,
} from "@/domain/library/main-ingredient";
import { TAG_GROUPS } from "@/domain/library/tags";
import type { Db } from "@/server/catalog";

/**
 * Gives a household's recipes the tags of "Hauptzutat": what each dish is made of, read from
 * its ingredients and its title (`mainIngredients`), without a model. Tags a recipe has stay;
 * one taken away by hand comes back only if the script runs again.
 *
 *   npm run library:main-ingredients -- "Stührmann"            dry run: counts and examples
 *   npm run library:main-ingredients -- "Stührmann" --apply    store the tags
 *
 * It needs the tags of the group, which the migration `main_ingredient_tags` adds. At the end
 * it says how many recipes still have no tag but their effort: those are described by the
 * model with `npm run import:tag-recipes -- "<name>" --more`.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Supabase settings must be set in .env.local. See .env.example.");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } }) as unknown as Db;

async function all<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(JSON.stringify(error));
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  if (!name || name.startsWith("--")) {
    console.error('Usage: npm run library:main-ingredients -- "<household name>" [--apply]');
    process.exit(1);
  }
  const apply = flags.includes("--apply");
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  const householdId = household.data.id;

  const [tags, recipes, links, catalog, lines] = await Promise.all([
    all((from, to) =>
      db
        .from("tag")
        .select("id, key, group_name")
        .eq("household_id", householdId)
        .order("id")
        .range(from, to),
    ),
    all((from, to) =>
      db
        .from("recipe")
        .select("id, title")
        .eq("household_id", householdId)
        .eq("status", "approved")
        .order("id")
        .range(from, to),
    ),
    all((from, to) =>
      db
        .from("recipe_tag")
        .select("recipe_id, tag_id")
        .eq("household_id", householdId)
        .order("recipe_id")
        .order("tag_id")
        .range(from, to),
    ),
    all((from, to) =>
      db
        .from("ingredient")
        .select("id, name")
        .eq("household_id", householdId)
        .order("id")
        .range(from, to),
    ),
    all((from, to) =>
      db
        .from("recipe_ingredient")
        .select("id, recipe_id, ingredient_id, original_text")
        .eq("household_id", householdId)
        .order("id")
        .range(from, to),
    ),
  ]);

  const tagOf = new Map(tags.map((tag) => [tag.id, tag]));
  const idOfKey = new Map(tags.flatMap((tag) => (tag.key ? [[tag.key, tag.id] as const] : [])));
  const missing = MAIN_INGREDIENTS.filter((key) => !idOfKey.has(key));
  if (missing.length > 0) {
    console.log(`The tags ${missing.join(", ")} do not exist yet: apply the migration first.`);
    if (apply) process.exit(1);
  }
  const nameOf = new Map(catalog.map((ingredient) => [ingredient.id, ingredient.name]));
  const ingredientsOf = new Map<string, string[]>();
  for (const line of lines) {
    const text = (line.ingredient_id && nameOf.get(line.ingredient_id)) || line.original_text;
    if (text)
      ingredientsOf.set(line.recipe_id, [...(ingredientsOf.get(line.recipe_id) ?? []), text]);
  }
  const categoryOf = new Map<string, string>();
  const own = new Map<string, Set<string>>();
  for (const link of links) {
    const tag = tagOf.get(link.tag_id);
    if (!tag) continue;
    if (tag.group_name === "Kategorie" && tag.key) categoryOf.set(link.recipe_id, tag.key);
    own.set(link.recipe_id, (own.get(link.recipe_id) ?? new Set()).add(link.tag_id));
  }

  const toAdd: { household_id: string; recipe_id: string; tag_id: string }[] = [];
  const examples = new Map<MainIngredient, string[]>();
  const count = new Map<MainIngredient, number>();
  const described = new Set(
    tags
      .filter((tag) => (TAG_GROUPS as readonly string[]).includes(tag.group_name))
      .filter((tag) => tag.group_name !== "Aufwand")
      .map((tag) => tag.id),
  );
  let stillBare = 0;
  for (const recipe of recipes) {
    const found = mainIngredients({
      title: recipe.title,
      category: categoryOf.get(recipe.id) ?? null,
      ingredients: ingredientsOf.get(recipe.id) ?? [],
    });
    for (const key of found) {
      count.set(key, (count.get(key) ?? 0) + 1);
      const list = examples.get(key) ?? [];
      if (list.length < 5) examples.set(key, [...list, recipe.title]);
      const tagId = idOfKey.get(key);
      if (tagId && !own.get(recipe.id)?.has(tagId)) {
        toAdd.push({ household_id: householdId, recipe_id: recipe.id, tag_id: tagId });
      }
    }
    const has = [...(own.get(recipe.id) ?? [])].some((id) => described.has(id));
    if (!has && found.length === 0) stillBare++;
  }

  console.log(`${recipes.length} recipes.`);
  for (const key of MAIN_INGREDIENTS) {
    console.log(
      `  ${MAIN_INGREDIENT_NAME[key]}: ${count.get(key) ?? 0}  (${(examples.get(key) ?? []).join(" | ")})`,
    );
  }
  console.log(`${toAdd.length} tags to add.`);
  console.log(
    `${stillBare} recipes would still have no tag but their effort. Describe them with:\n` +
      `  npm run import:tag-recipes -- "${name}" --more`,
  );
  if (!apply) {
    console.log("\nDry run. Add --apply to store the tags.");
    return;
  }
  for (let at = 0; at < toAdd.length; at += 500) {
    const stored = await db.from("recipe_tag").upsert(toAdd.slice(at, at + 500), {
      onConflict: "recipe_id,tag_id",
      ignoreDuplicates: true,
    });
    if (stored.error) throw new Error(`store tags: ${stored.error.message}`);
  }
  console.log(`Stored ${toAdd.length} tags.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
