import { createClient } from "@supabase/supabase-js";
import { ALL_SUGGESTED } from "@/domain/library/tagging";
import { EFFORTS } from "@/domain/library/tags";
import type { Db } from "@/server/catalog";
import { createAnthropicTagger } from "@/server/import/anthropic-reader";
import { TAG_BATCH, tagRecipes } from "@/server/tagging";

/**
 * Gives the recipes of a household the tags that describe them: effort, kind of dish,
 * cuisine, season and occasion. A model suggests them from title, category, printed time and
 * ingredients, about fifteen recipes per request. Tags the household made itself stay.
 *
 *   npm run import:tag-recipes -- "Zuhause"              every recipe not described yet
 *   npm run import:tag-recipes -- "Zuhause" --limit 30   a few, to look at the result first
 *   npm run import:tag-recipes -- "Zuhause" --verbose    print what each recipe got
 *   npm run import:tag-recipes -- "Zuhause" --again      take the suggested tags away first.
 *                                                        This also undoes corrections made by hand.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const model = process.env.ANTHROPIC_EXTRACT_MODEL;
if (!url || !secret || !model) {
  console.error("Supabase and model settings must be set in .env.local. See .env.example.");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } }) as unknown as Db;
const tag = createAnthropicTagger({ model });

/** Requests side by side. More would only run into the model's rate limits. */
const WORKERS = 4;

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  if (!name || name.startsWith("--")) {
    console.error(
      'Usage: npm run import:tag-recipes -- "<household name>" [--limit N] [--verbose]',
    );
    process.exit(1);
  }
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  const householdId = household.data.id;
  const limitAt = flags.indexOf("--limit");
  const limit = limitAt === -1 ? Infinity : Number(flags[limitAt + 1]) || Infinity;
  const verbose = flags.includes("--verbose");

  const tags = await db.from("tag").select("id, key, name").eq("household_id", householdId);
  if (tags.error) throw new Error(tags.error.message);
  const suggested = tags.data.filter((row) => row.key !== null && ALL_SUGGESTED.includes(row.key));
  const nameOf = new Map(suggested.map((row) => [row.id, row.name]));
  if (flags.includes("--again")) {
    const removed = await db
      .from("recipe_tag")
      .delete()
      .eq("household_id", householdId)
      .in("tag_id", [...nameOf.keys()]);
    if (removed.error) throw new Error(`take suggested tags away: ${removed.error.message}`);
  }

  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await db
      .from("recipe")
      .select("id")
      .eq("household_id", householdId)
      .eq("status", "approved")
      .order("id")
      .range(from, from + 999);
    if (page.error) throw new Error(page.error.message);
    ids.push(...page.data.map((row) => row.id));
    if (page.data.length < 1000) break;
  }

  // Which of them say how much work they are: those are described and left alone.
  const efforts = suggested
    .filter((row) => (EFFORTS as readonly string[]).includes(row.key as string))
    .map((row) => row.id);
  const described = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const page = await db
      .from("recipe_tag")
      .select("recipe_id")
      .eq("household_id", householdId)
      .in("tag_id", efforts)
      .order("recipe_id")
      .order("tag_id")
      .range(from, from + 999);
    if (page.error) throw new Error(page.error.message);
    for (const row of page.data) described.add(row.recipe_id);
    if (page.data.length < 1000) break;
  }
  const waiting = ids.filter((id) => !described.has(id)).slice(0, limit);
  console.log(
    `${ids.length} recipes, ${described.size} described already, ${waiting.length} to do.`,
  );

  const chunks: string[][] = [];
  for (let at = 0; at < waiting.length; at += TAG_BATCH)
    chunks.push(waiting.slice(at, at + TAG_BATCH));
  let tagged = 0;
  let failed = 0;
  let cost = 0;
  const worker = async () => {
    for (let chunk = chunks.shift(); chunk; chunk = chunks.shift()) {
      try {
        const done = await tagRecipes(db, householdId, tag, chunk);
        tagged += done.tagged;
        // $0.10 and $0.50 per million tokens in and out.
        cost += (done.usage.inputTokens * 0.1 + done.usage.outputTokens * 0.5) / 1e6;
        if (verbose) {
          const [recipes, links] = await Promise.all([
            db.from("recipe").select("id, title, prep_minutes").in("id", chunk),
            db.from("recipe_tag").select("recipe_id, tag_id").in("recipe_id", chunk),
          ]);
          for (const recipe of recipes.data ?? []) {
            const own = (links.data ?? [])
              .filter((link) => link.recipe_id === recipe.id)
              .flatMap((link) => nameOf.get(link.tag_id) ?? []);
            const time = recipe.prep_minutes ? ` (${recipe.prep_minutes} Min.)` : "";
            console.log(`${recipe.title}${time}: ${own.join(", ")}`);
          }
        } else if (tagged % 150 < TAG_BATCH) {
          console.log(`… ${tagged} recipes`);
        }
      } catch (error) {
        // The recipes of this request keep waiting; running the script again takes them up.
        failed += chunk.length;
        console.error(`a request failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log(
    `\n${tagged} recipes described, ${failed} left for another run. About ${(cost * 100).toFixed(1)} ct.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
