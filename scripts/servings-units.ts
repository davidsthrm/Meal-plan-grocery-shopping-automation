import type { ExtractedRecipe } from "@/domain/import/extraction";
import { readServingsLine, resolveServings } from "@/domain/import/servings";
import { servingsText } from "@/lib/recipe-text";
import { adminDb, allRows, householdFromArgs } from "./lib/db";

/**
 * Brings recipes that were imported before the app knew servings units in line with what is
 * printed. Every import keeps the printed servings line, so no photo is read again: a recipe
 * whose line counts something other than persons ("1 Springform (Ø 26 cm)", "8 Stück") gets
 * that number and unit. Recipes for persons and recipes without a printed line are left as
 * they are.
 *
 *   npm run import:servings-units -- "Zuhause"            show what would change
 *   npm run import:servings-units -- "Zuhause" --apply    change it
 */

const db = adminDb();

async function main() {
  const { householdId, flags } = await householdFromArgs(
    db,
    'Usage: npm run import:servings-units -- "<household name>" [--apply]',
  );
  const apply = flags.includes("--apply");

  const jobs = await allRows(
    (from, to) =>
      db
        .from("import_job")
        .select("recipe_id, extraction")
        .eq("household_id", householdId)
        .not("recipe_id", "is", null)
        .not("extraction", "is", null)
        .order("id")
        .range(from, to),
    "load import jobs",
  );
  const recipes = await allRows(
    (from, to) =>
      db
        .from("recipe")
        .select("id, title, source_book, servings_min, servings_max, servings_unit")
        .eq("household_id", householdId)
        .order("id")
        .range(from, to),
    "load recipes",
  );
  const recipeOf = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const kinds: Record<string, number> = {};
  const unclear: string[] = [];
  let changed = 0;
  for (const job of jobs) {
    const recipe = recipeOf.get(job.recipe_id as string);
    if (!recipe) continue;
    const extraction = job.extraction as unknown as ExtractedRecipe;
    const line = readServingsLine(extraction.servingsRaw ?? "");
    kinds[line.kind] = (kinds[line.kind] ?? 0) + 1;
    if (line.kind === "unclear") {
      unclear.push(`"${extraction.servingsRaw}" (${recipe.title}, ${recipe.source_book})`);
    }
    if (line.kind !== "counted") continue;

    const printed = resolveServings(extraction);
    if (!printed) continue;
    if (
      recipe.servings_min === printed.min &&
      recipe.servings_max === printed.max &&
      recipe.servings_unit === printed.unit
    ) {
      continue;
    }
    changed++;
    const before = servingsText(recipe.servings_min, recipe.servings_max, recipe.servings_unit);
    const after = servingsText(printed.min, printed.max, printed.unit);
    console.log(
      `${before.padEnd(16)} -> ${after.padEnd(38)} ${recipe.title} (${recipe.source_book})`,
    );
    if (apply) {
      const updated = await db
        .from("recipe")
        .update({
          servings_min: printed.min,
          servings_max: printed.max,
          servings_unit: printed.unit,
        })
        .eq("id", recipe.id);
      if (updated.error) throw new Error(`update "${recipe.title}": ${updated.error.message}`);
    }
  }

  console.log("");
  console.log(`Imported recipes: ${jobs.length}. Their servings lines: ${JSON.stringify(kinds)}`);
  for (const line of unclear) console.log(`  not understood, left alone: ${line}`);
  console.log(
    apply
      ? `${changed} recipes changed.`
      : `${changed} recipes would change. Run again with --apply to change them.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
