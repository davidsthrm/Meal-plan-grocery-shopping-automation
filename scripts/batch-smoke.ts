import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { must } from "@/server/catalog";
import { addPages, batchProgress, createBatch, processNext } from "@/server/import/batch";
import { PHOTO_BUCKET } from "@/server/import/storage";
import type { Database } from "@/server/supabase/database.types";

/**
 * Runs a whole batch import as the test household's user, against the real database, storage
 * and models: upload photos, look at the pages, group them, import the recipes.
 * Needs `npm run e2e:setup` first. Calls the API and costs a few cents.
 *
 *   npm run e2e:batch -- samples/IMG_5681.HEIC samples/recipes/*
 *   npm run e2e:batch -- --last          show the latest batch again, without running anything
 */

const reportOnly = process.argv.includes("--last");
const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (files.length === 0 && !reportOnly) {
  console.error("Give the photos of the batch in page order, or --last to show the latest batch.");
  process.exit(1);
}

async function runBatch(db: SupabaseClient<Database>, householdId: string, userId: string) {
  const batchId = await createBatch(db, householdId, userId, "Testbuch");
  const targets = await addPages(
    db,
    householdId,
    batchId,
    files.map((file) => basename(file)),
  );
  for (const [i, target] of targets.entries()) {
    const uploaded = await db.storage
      .from(PHOTO_BUCKET)
      .uploadToSignedUrl(target.path, target.token, readFileSync(files[i]), {
        contentType: "image/heic",
      });
    if (uploaded.error) throw new Error(`upload ${files[i]}: ${uploaded.error.message}`);
  }
  console.log(`Uploaded ${targets.length} photos. Processing ...`);

  const started = Date.now();
  // Three requests side by side, as the batch page does it.
  const worker = async () => {
    for (let step = 1; ; step++) {
      const result = await processNext(db, householdId, batchId);
      if (result === "done") return;
      if (result === "waiting") await new Promise((resolve) => setTimeout(resolve, 1000));
      if (step > 400) throw new Error("the batch does not finish");
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log(`Finished in ${((Date.now() - started) / 1000).toFixed(0)} s.`);
  return batchId;
}

async function main() {
  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const signedIn = await db.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (signedIn.error) throw new Error(`sign in as test user: ${signedIn.error.message}`);
  const userId = signedIn.data.user.id;
  const household = must(await db.from("household").select("id, name").single(), "load household");
  console.log(`Signed in. Household: ${household.name}`);

  const batchId = reportOnly
    ? must(
        await db
          .from("import_batch")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1),
        "load latest batch",
      )[0].id
    : await runBatch(db, household.id, userId);
  console.log("Progress:", JSON.stringify(await batchProgress(db, batchId)));

  const pages = must(
    await db
      .from("import_page")
      .select("position, file_name, status, printed_page, original_path, photo_path, error")
      .eq("batch_id", batchId)
      .order("position"),
    "load pages",
  );
  for (const page of pages) {
    console.log(
      `  page ${page.position} ${page.file_name.padEnd(14)} ${page.status.padEnd(8)} printed ${String(page.printed_page).padEnd(5)}` +
        ` original ${page.original_path ? "KEPT" : "removed"}  ${page.error ?? ""}`,
    );
  }
  const jobs = must(
    await db
      .from("import_job")
      .select("position, status, issues, input_tokens, output_tokens, recipe_id")
      .eq("batch_id", batchId)
      .order("position"),
    "load recipes of batch",
  );
  const recipes = must(
    await db
      .from("recipe")
      .select("id, title, source_book, source_page, servings_min, servings_unit, status"),
    "load recipes",
  );
  for (const job of jobs) {
    const recipe = recipes.find((r) => r.id === job.recipe_id);
    const cents = (((job.input_tokens ?? 0) * 0.1 + (job.output_tokens ?? 0) * 0.5) / 1e6) * 100;
    const issues = (job.issues as { code: string }[]).map((issue) => issue.code).join(", ");
    console.log(
      `  recipe ${job.position} ${job.status.padEnd(12)} "${recipe?.title}" ${recipe?.source_book} S. ${recipe?.source_page}` +
        `, ${recipe?.servings_min} ${recipe?.servings_unit ?? "Portionen"}  ${job.input_tokens} tokens in  ${cents.toFixed(2)} ct  ${issues}`,
    );
  }
  const lines = must(await db.from("recipe_ingredient").select("id, ingredient_id"), "load lines");
  console.log(
    `Stored ingredient lines: ${lines.length}, of which mapped to the catalog: ${lines.filter((l) => l.ingredient_id).length}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
