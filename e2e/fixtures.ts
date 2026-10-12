import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { Database } from "../src/server/supabase/database.types";

/**
 * Known starting state for the browser tests, in the separate test household: one recipe that
 * waits for review, with a missing title and one ingredient the catalog does not know.
 * Everything is written directly, without the models, so the tests are free and repeatable.
 */

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

function check<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (result.error || result.data == null) throw new Error(`${what}: ${result.error?.message}`);
  return result.data;
}

async function testHousehold(): Promise<string> {
  const rows = check(
    await db.from("household").select("id").eq("name", "E2E-Test (automatisch)"),
    "find test household",
  );
  if (rows.length !== 1) throw new Error("Test household not found. Run `npm run e2e:setup`.");
  return rows[0].id;
}

export async function resetImportData(): Promise<{ jobId: string; batchId: string }> {
  const household = await testHousehold();
  // Only ever the test household: every statement is scoped to its id.
  await db.from("import_batch").delete().eq("household_id", household);
  await db.from("recipe").delete().eq("household_id", household);
  await db.from("ingredient_proposal").delete().eq("household_id", household);
  await db.from("ingredient").delete().eq("household_id", household).eq("name", "Topinambur");

  const ingredient = async (name: string) =>
    check(
      await db
        .from("ingredient")
        .select("id, aisle_group_id, preferred_shop_id")
        .eq("household_id", household)
        .eq("name", name)
        .single(),
      `find ${name}`,
    );
  const potato = await ingredient("Kartoffeln");
  const salt = await ingredient("Salz");

  const photoPath = `${household}/e2e/pages/0000.jpg`;
  const photo = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#e9e2d2" },
  })
    .jpeg()
    .toBuffer();
  const stored = await db.storage
    .from("recipe-photos")
    .upload(photoPath, photo, { contentType: "image/jpeg", upsert: true });
  if (stored.error) throw new Error(`store test photo: ${stored.error.message}`);

  const batch = check(
    await db
      .from("import_batch")
      .insert({
        household_id: household,
        source_book: "E2E Kochbuch",
        grouped_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
    "create batch",
  );
  const page = check(
    await db
      .from("import_page")
      .insert({
        household_id: household,
        batch_id: batch.id,
        position: 0,
        file_name: "IMG_0001.jpg",
        photo_path: photoPath,
        status: "read",
        printed_page: 12,
      })
      .select("id")
      .single(),
    "create page",
  );
  const proposal = check(
    await db
      .from("ingredient_proposal")
      .insert({
        household_id: household,
        name: "Topinambur",
        aisle_group_id: potato.aisle_group_id,
        preferred_shop_id: potato.preferred_shop_id,
        default_unit: "g",
        buying_mode: "weight",
      })
      .select("id")
      .single(),
    "create proposal",
  );
  const recipe = check(
    await db
      .from("recipe")
      .insert({
        household_id: household,
        title: "Ohne Titel",
        source_book: "E2E Kochbuch",
        source_page: 12,
        servings_min: 4,
        servings_max: 4,
        prep_minutes: 30,
        status: "needs_review",
      })
      .select("id")
      .single(),
    "create recipe",
  );
  const lines = await db.from("recipe_ingredient").insert([
    {
      household_id: household,
      recipe_id: recipe.id,
      position: 0,
      ingredient_id: potato.id,
      quantity: 500,
      unit: "g",
      original_text: "500 g Kartoffeln",
    },
    {
      household_id: household,
      recipe_id: recipe.id,
      position: 1,
      ingredient_id: null,
      proposal_id: proposal.id,
      quantity: 300,
      unit: "g",
      original_text: "300 g Topinambur",
    },
    {
      household_id: household,
      recipe_id: recipe.id,
      position: 2,
      ingredient_id: salt.id,
      original_text: "Salz",
    },
  ]);
  if (lines.error) throw new Error(`create lines: ${lines.error.message}`);
  const job = check(
    await db
      .from("import_job")
      .insert({
        household_id: household,
        batch_id: batch.id,
        status: "needs_review",
        page_ids: [page.id],
        photo_paths: [photoPath],
        recipe_id: recipe.id,
        issues: [
          {
            code: "title_missing",
            ingredientIndex: null,
            detail: "no title on the photos and none entered",
          },
          { code: "unmapped_ingredient", ingredientIndex: 1, detail: "Topinambur" },
        ],
        notes: ["Tippkasten wurde nicht übernommen."],
        extraction: {
          dishType: "suppe-eintopf",
          proteinType: "vegan",
          ingredients: [{ name: "Kartoffeln" }, { name: "Topinambur" }, { name: "Salz" }],
        },
      })
      .select("id")
      .single(),
    "create job",
  );
  return { jobId: job.id, batchId: batch.id };
}

export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/rezepte");
}
