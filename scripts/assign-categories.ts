import { createClient } from "@supabase/supabase-js";
import { categoryFromTitle } from "@/domain/library/quality";
import type { Database } from "@/server/supabase/database.types";

/**
 * Files drinks and cookies under their categories by what their titles say, the way the
 * check of the library suggests it (`categoryFromTitle`): a Bowle or a Sirup is a drink,
 * Vanillekipferl are Plätzchen. Only those two categories are given, and only to recipes
 * filed as cakes, desserts, snacks or nothing.
 *
 *   npm run library:assign-categories -- "Stührmann"            show what would change
 *   npm run library:assign-categories -- "Stührmann" --apply    change it
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  process.exit(1);
}
const db = createClient<Database>(url, secret, { auth: { persistSession: false } });

const PAGE = 500;
const GIVEN = ["getraenk", "plaetzchen"];
/** Only these move: a soup called "Grüner Cappuccino" stays a soup. */
const MOVABLE: (string | null)[] = ["kuchen", "dessert", "snack", null];

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");
  if (!name || name.startsWith("--")) {
    console.error('Usage: npm run library:assign-categories -- "<household name>" [--apply]');
    process.exit(1);
  }
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  const householdId = household.data.id;
  const tags = await db
    .from("tag")
    .select("id, key, name")
    .eq("household_id", householdId)
    .eq("group_name", "Kategorie");
  if (tags.error) throw new Error(tags.error.message);
  const keyOf = new Map(tags.data.map((tag) => [tag.id, tag.key]));
  const idOf = new Map(tags.data.map((tag) => [tag.key, tag.id]));
  const nameOf = new Map(tags.data.map((tag) => [tag.key, tag.name]));
  for (const key of GIVEN) {
    if (!idOf.has(key))
      throw new Error(`The household has no category "${key}". Apply the migrations first.`);
  }

  const recipes: { id: string; title: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("recipe")
      .select("id, title")
      .eq("household_id", householdId)
      .eq("status", "approved")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) throw new Error(`load recipes: ${error?.message}`);
    recipes.push(...data);
    if (data.length < PAGE) break;
  }
  const categoryOf = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("recipe_tag")
      .select("recipe_id, tag_id")
      .eq("household_id", householdId)
      .in("tag_id", [...keyOf.keys()])
      .order("recipe_id")
      .range(from, from + PAGE - 1);
    if (error || !data) throw new Error(`load categories: ${error?.message}`);
    for (const link of data) categoryOf.set(link.recipe_id, keyOf.get(link.tag_id) ?? "");
    if (data.length < PAGE) break;
  }

  const changes = recipes.flatMap((recipe) => {
    const wanted = categoryFromTitle(recipe.title);
    const current = categoryOf.get(recipe.id) ?? null;
    return wanted && GIVEN.includes(wanted) && wanted !== current && MOVABLE.includes(current)
      ? [{ recipe, from: current, to: wanted }]
      : [];
  });
  for (const key of GIVEN) {
    const these = changes.filter((change) => change.to === key);
    console.log(`\n${nameOf.get(key)} (${these.length}):`);
    for (const change of these) {
      console.log(
        `  ${change.recipe.title}  (bisher ${change.from ? nameOf.get(change.from) : "keine"})`,
      );
    }
  }
  if (!apply) {
    console.log("\nNothing changed. Add --apply to file them.");
    return;
  }
  for (const change of changes) {
    const removed = await db
      .from("recipe_tag")
      .delete()
      .eq("recipe_id", change.recipe.id)
      .in("tag_id", [...keyOf.keys()]);
    if (removed.error) throw new Error(`clear category: ${removed.error.message}`);
    const added = await db.from("recipe_tag").insert({
      household_id: householdId,
      recipe_id: change.recipe.id,
      tag_id: idOf.get(change.to) as string,
    });
    if (added.error) throw new Error(`set category: ${added.error.message}`);
  }
  console.log(`\n${changes.length} recipes filed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
