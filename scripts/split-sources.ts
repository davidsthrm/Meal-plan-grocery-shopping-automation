import { createClient } from "@supabase/supabase-js";
import { sourceLabel, splitSource } from "@/domain/library/source";
import type { Database } from "@/server/supabase/database.types";

/**
 * Splits the sources stored before the app knew a magazine's editions: "Einfach Hausgemacht
 * 06/2020" becomes the stack "Einfach Hausgemacht" with the edition "06/2020", for its
 * recipes and its batches. A name is split only where it ends in an edition ("06/2020",
 * "Jahresheft 2021"); a cookbook stays as it is.
 *
 *   npm run library:split-sources -- "Stührmann"            show what would change
 *   npm run library:split-sources -- "Stührmann" --apply    change it
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  process.exit(1);
}
const db = createClient<Database>(url, secret, { auth: { persistSession: false } });

const PAGE = 500;

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");
  if (!name || name.startsWith("--")) {
    console.error('Usage: npm run library:split-sources -- "<household name>" [--apply]');
    process.exit(1);
  }
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  const householdId = household.data.id;

  const recipes: { id: string; source_book: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("recipe")
      .select("id, source_book")
      .eq("household_id", householdId)
      .is("source_edition", null)
      .not("source_book", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) throw new Error(`load recipes: ${error?.message}`);
    recipes.push(...data);
    if (data.length < PAGE) break;
  }
  const batches = await db
    .from("import_batch")
    .select("id, source_book")
    .eq("household_id", householdId)
    .is("source_edition", null)
    .not("source_book", "is", null);
  if (batches.error) throw new Error(`load batches: ${batches.error.message}`);

  // Only the shape of a name decides, not the library: a book stored as "Einfach
  // Hausgemacht 06/2020" is itself among the sources and would match itself.
  const changes = new Map<string, { book: string; edition: string }>();
  for (const row of [...recipes, ...batches.data]) {
    const split = splitSource(row.source_book ?? "", []);
    if (split.edition)
      changes.set(row.source_book as string, { book: split.book, edition: split.edition });
  }
  if (changes.size === 0) {
    console.log("Nothing to split.");
    return;
  }
  for (const [stored, { book, edition }] of changes) {
    const count = recipes.filter((recipe) => recipe.source_book === stored).length;
    const batchCount = batches.data.filter((batch) => batch.source_book === stored).length;
    console.log(
      `"${stored}" → "${book}", Ausgabe "${edition}" (${count} Rezepte, ${batchCount} Stapel)` +
        (sourceLabel(book, edition) === stored ? "" : " – Name ändert sich"),
    );
    if (!apply) continue;
    for (const table of ["recipe", "import_batch"] as const) {
      const updated = await db
        .from(table)
        .update({ source_book: book, source_edition: edition })
        .eq("household_id", householdId)
        .eq("source_book", stored)
        .is("source_edition", null);
      if (updated.error) throw new Error(`split ${table}: ${updated.error.message}`);
    }
  }
  console.log(apply ? "Done." : "Nothing changed. Add --apply to split them.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
