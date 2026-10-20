import { createClient } from "@supabase/supabase-js";
import { createCatalogIndex, type Catalog, type Ingredient } from "@/domain/catalog";
import { stalksAsStaengel } from "@/domain/import/draft";
import { amountOfCut, wholeOfCut } from "@/domain/import/map-ingredient";
import type { Unit } from "@/domain/units";
import type { Database } from "@/server/supabase/database.types";

/**
 * Tidies recipe lines the import stored before it knew two rules:
 *
 * - A cut of something bought by the piece is that thing ("Zitronenscheiben" are lemons):
 *   such an ingredient, made from a proposal, is merged into the whole. Its recipe lines
 *   point to the whole in slices (or as a part of a piece for "Zitronenachtel"), whatever
 *   else named it follows, and its name becomes another name of the whole.
 * - A line printed in stalks ("3 Stiele Thymian") is counted in Stängel, and the word is
 *   taken out of its note.
 *
 *   npm run library:tidy-lines -- "Stührmann"            show what would change
 *   npm run library:tidy-lines -- "Stührmann" --apply    change it
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  process.exit(1);
}
const db = createClient<Database>(url, secret, { auth: { persistSession: false } });

const PAGE = 500;

/** The tables that name an ingredient by its id, besides the recipe lines. */
const NAMING_TABLES = [
  ["plan_slot_food", "ingredient_id"],
  ["shopping_manual_entry", "ingredient_id"],
  ["recurring_item", "ingredient_id"],
  ["shopping_line", "ingredient_id"],
  ["receipt_line", "ingredient_id"],
  ["ingredient_proposal", "same_as_ingredient_id"],
  ["ingredient_proposal", "resolved_ingredient_id"],
] as const;

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");
  if (!name || name.startsWith("--")) {
    console.error('Usage: npm run library:tidy-lines -- "<household name>" [--apply]');
    process.exit(1);
  }
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  const householdId = household.data.id;

  const rows = await db
    .from("ingredient")
    .select("id, name, synonyms, default_unit, buying_mode")
    .eq("household_id", householdId)
    .eq("status", "active");
  if (rows.error) throw new Error(`load ingredients: ${rows.error.message}`);
  // Only names, units and buying modes decide which ingredient a cut belongs to.
  const ingredients = rows.data.map(
    (row) =>
      ({
        id: row.id,
        name: row.name,
        synonyms: row.synonyms,
        defaultUnit: row.default_unit,
        buyingMode: row.buying_mode,
      }) as Ingredient,
  );
  const index = createCatalogIndex({
    ingredients,
    shops: [],
    aisleGroups: [],
  } as unknown as Catalog);

  // Cuts merged into their whole.
  let merged = 0;
  for (const cut of ingredients) {
    const whole = wholeOfCut(index, cut.name);
    if (!whole || whole.ingredient.id === cut.id) continue;
    const lines = await db
      .from("recipe_ingredient")
      .select("id, quantity, quantity_max, unit")
      .eq("ingredient_id", cut.id);
    if (lines.error) throw new Error(`load lines of ${cut.name}: ${lines.error.message}`);
    console.log(
      `"${cut.name}" → "${whole.ingredient.name}" (${lines.data.length} Rezeptzeilen, als ${whole.cut})`,
    );
    merged++;
    if (!apply) continue;
    for (const line of lines.data) {
      const amount = amountOfCut(
        {
          quantity: line.quantity,
          quantityMax: line.quantity_max,
          unit: line.unit as string | null,
        },
        whole.cut,
      );
      const updated = await db
        .from("recipe_ingredient")
        .update({
          ingredient_id: whole.ingredient.id,
          quantity: amount.quantity,
          quantity_max: amount.quantityMax,
          unit: amount.unit as Unit | null,
        })
        .eq("id", line.id);
      if (updated.error) throw new Error(`move line of ${cut.name}: ${updated.error.message}`);
    }
    // The tables differ in their columns; each named here has the one it is listed with.
    for (const [table, column] of NAMING_TABLES) {
      const moved = await db
        .from(table)
        .update({ [column]: whole.ingredient.id } as never)
        .eq(column as "household_id", cut.id);
      if (moved.error) throw new Error(`move ${table} of ${cut.name}: ${moved.error.message}`);
    }
    const removed = await db.from("ingredient").delete().eq("id", cut.id);
    if (removed.error) throw new Error(`remove ${cut.name}: ${removed.error.message}`);
    // Its names go to the whole only now: one name may not stand for two ingredients.
    const names = [...whole.ingredient.synonyms];
    for (const other of [cut.name, ...cut.synonyms]) {
      if (!names.some((known) => known.toLowerCase() === other.toLowerCase())) names.push(other);
    }
    const named = await db
      .from("ingredient")
      .update({ synonyms: names })
      .eq("id", whole.ingredient.id);
    if (named.error) throw new Error(`name ${whole.ingredient.name}: ${named.error.message}`);
    whole.ingredient.synonyms = names;
  }

  // Lines printed in stalks.
  const stalks: {
    id: string;
    original_text: string;
    quantity: number | null;
    unit: string | null;
    note: string | null;
  }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("recipe_ingredient")
      .select("id, original_text, quantity, unit, note")
      .eq("household_id", householdId)
      .ilike("original_text", "%stiel%")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) throw new Error(`load lines: ${error?.message}`);
    stalks.push(...data);
    if (data.length < PAGE) break;
  }
  let counted = 0;
  for (const line of stalks) {
    const tidy = stalksAsStaengel({ ...line, raw: line.original_text });
    if (tidy.unit === line.unit && tidy.note === line.note) continue;
    console.log(
      `"${line.original_text}": ${line.unit ?? "–"} → ${tidy.unit}, Notiz "${line.note ?? ""}" → "${tidy.note ?? ""}"`,
    );
    counted++;
    if (!apply) continue;
    const updated = await db
      .from("recipe_ingredient")
      .update({ unit: tidy.unit as Unit, note: tidy.note })
      .eq("id", line.id);
    if (updated.error) throw new Error(`tidy line: ${updated.error.message}`);
  }

  console.log(`${merged} Zutaten zusammengeführt, ${counted} Zeilen in Stängeln.`);
  console.log(apply ? "Done." : "Nothing changed. Add --apply to change it.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
