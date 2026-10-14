import { createClient } from "@supabase/supabase-js";
import {
  createAnthropicFramer,
  createAnthropicUprightFinder,
} from "@/server/import/anthropic-reader";
import type { Db } from "@/server/catalog";
import { frameNextPage } from "@/server/import/frame-stored";

/**
 * Frames the page photos of recipes that were imported before the app did this by itself:
 * turns pages upright that lie on their side, and stores a cut-out view for every recipe
 * that shares its page with others. Calls the model once or twice per page, about 0.1 ct.
 *
 *   npm run import:frame-photos -- "Stührmann"              every page not framed yet
 *   npm run import:frame-photos -- "Stührmann" --limit 10   a few, to look at the result first
 *   npm run import:frame-photos -- "Stührmann" --path <storage path>   one page, or one batch
 *   npm run import:frame-photos -- "Stührmann" --path <storage path> --again   frame them anew
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const model = process.env.ANTHROPIC_EXTRACT_MODEL;
if (!url || !secret || !model) {
  console.error("Supabase and model settings must be set in .env.local. See .env.example.");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } }) as unknown as Db;
const models = {
  upright: createAnthropicUprightFinder({ model }),
  frame: createAnthropicFramer({ model }),
};

/** Pages worked on side by side. More would only run into the model's rate limits. */
const WORKERS = 4;
/** An outage rather than a page that cannot be framed: stop and run it again later. */
const MAX_FAILURES_IN_A_ROW = 5;

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  const option = (flag: string) => {
    const at = flags.indexOf(flag);
    return at === -1 ? null : (flags[at + 1] ?? null);
  };
  if (!name || name.startsWith("--")) {
    console.error('Usage: npm run import:frame-photos -- "<household name>" [--limit N]');
    process.exit(1);
  }
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  const householdId = household.data.id;
  const limit = Number(option("--limit")) || Infinity;
  const prefix = option("--path") ?? `${householdId}/`;

  if (flags.includes("--again")) {
    // Pages that were framed before are looked at once more, as if they were new.
    const reset = await db
      .from("recipe_photo")
      .update({ framed_at: null })
      .eq("household_id", householdId)
      .like("storage_path", `${prefix}%`);
    if (reset.error) throw new Error(`frame again: ${reset.error.message}`);
  }

  let pages = 0;
  let turned = 0;
  let cropped = 0;
  let unclear = 0;
  let failed = 0;
  let failedInARow = 0;
  let cost = 0;
  const worker = async () => {
    while (pages + failed < limit && failedInARow < MAX_FAILURES_IN_A_ROW) {
      try {
        const done = await frameNextPage(db, householdId, models, prefix);
        if (!done) return;
        if (done === "taken") continue;
        failedInARow = 0;
        pages++;
        if (done.turned !== 0) turned++;
        if (!done.certain) unclear++;
        cropped += done.cropped;
        // $0.10 and $0.50 per million tokens in and out.
        cost += (done.usage.inputTokens * 0.1 + done.usage.outputTokens * 0.5) / 1e6;
        if (done.turned !== 0 || !done.certain || process.argv.includes("--verbose")) {
          console.log(
            `${done.path.split("/").slice(1).join("/")}  ` +
              (done.certain
                ? `turned ${done.turned}°, ${done.cropped} views cut`
                : "unclear how it lies, left as photographed"),
          );
        }
        if (pages % 50 === 0) console.log(`… ${pages} pages`);
      } catch (error) {
        // One failure must not stop the rest. After an outage the page is tried again, so a
        // failure that keeps repeating ends the run instead of circling.
        failed++;
        failedInARow++;
        console.error(`a page failed: ${error instanceof Error ? error.message : error}`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log(
    `\n${pages} pages framed: ${turned} turned upright, ${unclear} left as photographed because it stayed unclear how they lie, ${cropped} recipe views cut out, ${failed} failed. About ${(cost * 100).toFixed(1)} ct.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
