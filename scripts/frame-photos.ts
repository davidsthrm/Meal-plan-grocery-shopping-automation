import {
  createAnthropicFramer,
  createAnthropicUprightFinder,
} from "@/server/import/anthropic-reader";
import { frameNextPage } from "@/server/import/frame-stored";
import { flag, option } from "./lib/cli";
import { adminDb, householdFromArgs } from "./lib/db";
import { costOf } from "./lib/prices";

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

const SETTINGS_MISSING = "Supabase and model settings must be set in .env.local. See .env.example.";
const model = process.env.ANTHROPIC_EXTRACT_MODEL ?? "";
if (!model) {
  console.error(SETTINGS_MISSING);
  process.exit(1);
}
const db = adminDb(SETTINGS_MISSING);
const models = {
  upright: createAnthropicUprightFinder({ model }),
  frame: createAnthropicFramer({ model }),
};

/** Pages worked on side by side. More would only run into the model's rate limits. */
const WORKERS = 4;
/** An outage rather than a page that cannot be framed: stop and run it again later. */
const MAX_FAILURES_IN_A_ROW = 5;

async function main() {
  const { householdId } = await householdFromArgs(
    db,
    'Usage: npm run import:frame-photos -- "<household name>" [--limit N]',
  );
  const limit = Number(option("limit")) || Infinity;
  const prefix = option("path") ?? `${householdId}/`;

  if (flag("again")) {
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
        cost += costOf(model, done.usage) ?? 0;
        if (done.turned !== 0 || !done.certain || flag("verbose")) {
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
