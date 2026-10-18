import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/catalog";
import {
  createAnthropicStepsReader,
  createAnthropicStepsVerifier,
} from "@/server/import/anthropic-reader";
import { fillSteps, loadStepsTargets, type StepsTarget } from "@/server/import/fill-steps";
import { RecipeReadError } from "@/server/import/read-recipe";

/**
 * Fills in the preparation steps of recipes imported before steps were read, from their page
 * photos in storage, cookbook by cookbook. Only the steps are read; the ingredients stay as
 * they are. A second request checks them. Steps with doubts are stored with the doubts, which
 * the recipe page shows next to them; a recipe whose photos show no steps gets an empty list
 * and is not read again. Steps a person saved are never overwritten.
 *
 *   npm run import:fill-steps -- "Stührmann"                         what there is to do, and the cost
 *   npm run import:fill-steps -- "Stührmann" --book "<cookbook>" --try 5   read five, print, store nothing
 *   npm run import:fill-steps -- "Stührmann" --book "<cookbook>" --write   read and store
 *   npm run import:fill-steps -- "Stührmann" --write --all              every cookbook at once
 *   npm run import:fill-steps -- "Stührmann" --book "<cookbook>" --write --again
 *                                          read again the steps that were stored with doubts
 *
 * Without --try or --write nothing calls the model.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const readModel = process.env.ANTHROPIC_EXTRACT_MODEL;
const verifyModel = process.env.ANTHROPIC_VERIFY_MODEL;
if (!url || !secret || !readModel || !verifyModel) {
  console.error("Supabase and model settings must be set in .env.local. See .env.example.");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } }) as unknown as Db;
const models = {
  readSteps: createAnthropicStepsReader({ model: readModel }),
  verifySteps: createAnthropicStepsVerifier({ model: verifyModel }),
};

/** Requests side by side. More would only run into the model's rate limits. */
const WORKERS = 4;
/** An outage rather than a recipe that cannot be read: stop and run it again later. */
const MAX_FAILURES_IN_A_ROW = 5;

/** $0.10 and $0.50 per million tokens in and out (claude-haiku-5-5, October 2026). */
const cents = (usage: { inputTokens: number; outputTokens: number }) =>
  ((usage.inputTokens * 0.1 + usage.outputTokens * 0.5) / 1e6) * 100;

/**
 * Tokens of both requests together per page, measured with `npm run import:eval-steps` on the
 * five sample pages at the size they are stored at (October 2026): 0.21 ct. A cut-out is not
 * measured; it is counted as half a page in each request. Used only for the estimate.
 */
const PER_PAGE = { inputTokens: 12_600, outputTokens: 1_750 };
const PER_CUT_OUT = { inputTokens: 6_000, outputTokens: 0 };

function estimate(targets: StepsTarget[]): number {
  let total = 0;
  for (const target of targets) {
    const pages = target.photos.length;
    const cutOuts = target.photos.filter((photo) => photo.cropPath).length;
    total += cents({
      inputTokens: PER_PAGE.inputTokens * pages + PER_CUT_OUT.inputTokens * cutOuts,
      outputTokens: PER_PAGE.outputTokens * pages,
    });
  }
  return total;
}

async function main() {
  const [name, ...flags] = process.argv.slice(2);
  const option = (flag: string) => {
    const at = flags.indexOf(flag);
    return at === -1 ? null : (flags[at + 1] ?? null);
  };
  if (!name || name.startsWith("--")) {
    console.error(
      'Usage: npm run import:fill-steps -- "<household name>" [--book "<cookbook>"] [--try N | --write] [--again] [--limit N]',
    );
    process.exit(1);
  }
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  const book = option("--book");
  const write = flags.includes("--write");
  const tryCount = Number(option("--try")) || 0;
  const limit = Number(option("--limit")) || Infinity;
  if (write && !book && !flags.includes("--all")) {
    console.error('Name a cookbook with --book "<cookbook>", or store all with --all.');
    process.exit(1);
  }

  const targets = await loadStepsTargets(db, household.data.id, {
    book,
    again: flags.includes("--again"),
  });

  // What there is to do, per cookbook, and what it would cost.
  const byBook = new Map<string, StepsTarget[]>();
  for (const target of targets) {
    const key = target.book ?? "(ohne Kochbuch)";
    byBook.set(key, [...(byBook.get(key) ?? []), target]);
  }
  console.log(`\n${"Cookbook".padEnd(34)} recipes  pages  cut-outs  estimate`);
  for (const [key, list] of [...byBook].sort((a, b) => b[1].length - a[1].length)) {
    const pages = list.reduce((sum, t) => sum + t.photos.length, 0);
    const cutOuts = list.reduce((sum, t) => sum + t.photos.filter((p) => p.cropPath).length, 0);
    console.log(
      `${key.slice(0, 33).padEnd(34)} ${String(list.length).padStart(7)}  ${String(pages).padStart(5)}  ${String(cutOuts).padStart(8)}  ${estimate(list).toFixed(1).padStart(6)} ct`,
    );
  }
  console.log(
    `${"All".padEnd(34)} ${String(targets.length).padStart(7)}${" ".repeat(25)}${estimate(targets).toFixed(1).padStart(6)} ct`,
  );
  if (!write && tryCount === 0) {
    console.log(
      "\nNothing was read. --try N reads a few and stores nothing; --write with --book stores the steps.",
    );
    return;
  }

  const queue = targets.slice(0, Math.min(limit, tryCount > 0 ? tryCount : Infinity));
  console.log(
    `\n${write ? "Reading and storing" : "Trying, nothing is stored:"} ${queue.length} recipes, about ${estimate(queue).toFixed(1)} ct.\n`,
  );
  const counts = { read: 0, doubtful: 0, none: 0, failed: 0 };
  const doubtful: string[] = [];
  let failedInARow = 0;
  let spent = 0;
  const worker = async () => {
    for (let target = queue.shift(); target; target = queue.shift()) {
      if (failedInARow >= MAX_FAILURES_IN_A_ROW) return;
      try {
        const done = await fillSteps(db, target, models, write);
        failedInARow = 0;
        counts[done.outcome]++;
        spent += cents(done.usage);
        if (done.outcome === "doubtful") {
          doubtful.push(
            `${target.title}  /rezepte/${target.recipeId}\n    ${done.doubts.join("\n    ")}`,
          );
        }
        if (!write || flags.includes("--verbose")) {
          console.log(`${target.title} (${done.outcome}, ${cents(done.usage).toFixed(2)} ct)`);
          done.steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
          for (const doubt of done.doubts) console.log(`  ! ${doubt}`);
          console.log();
        } else if ((counts.read + counts.doubtful + counts.none) % 25 === 0) {
          console.log(`… ${counts.read + counts.doubtful + counts.none} recipes`);
        }
      } catch (error) {
        counts.failed++;
        if (error instanceof RecipeReadError) {
          // Refused or garbled: the steps stay unknown and are tried again on the next run.
          console.error(`${target.title}: ${error.message}`);
          continue;
        }
        failedInARow++;
        console.error(`${target.title}: ${error instanceof Error ? error.message : error}`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));

  console.log(
    `\n${counts.read} read without doubt, ${counts.doubtful} with doubts, ${counts.none} without steps on the photo, ` +
      `${counts.failed} failed${write ? "" : " (nothing stored)"}. ${spent.toFixed(1)} ct.`,
  );
  if (doubtful.length > 0) {
    console.log("\nWith doubts, to compare with the photo:");
    for (const line of doubtful) console.log(`  ${line}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
