import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { Database } from "../src/server/supabase/database.types";
import { seedCatalog } from "../supabase/seed/catalog";

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

/** Puts a plain picture where a page photo would be. The tests never look at its content. */
async function storeTestPhoto(path: string, width: number, height: number): Promise<void> {
  const photo = await sharp({ create: { width, height, channels: 3, background: "#e9e2d2" } })
    .jpeg()
    .toBuffer();
  const stored = await db.storage
    .from("recipe-photos")
    .upload(path, photo, { contentType: "image/jpeg", upsert: true });
  if (stored.error) throw new Error(`store test photo: ${stored.error.message}`);
}

/**
 * Removes every recipe of the test household, and first the week plans that hold them. The
 * shopping lists and the note for what ran out go too: they belong to no week.
 */
async function clearRecipes(household: string): Promise<void> {
  const tables = ["shopping_list", "restock_item", "week_plan", "import_batch", "recipe"] as const;
  for (const table of tables) {
    const removed = await db.from(table).delete().eq("household_id", household);
    if (removed.error) throw new Error(`clear ${table}: ${removed.error.message}`);
  }
}

export async function resetImportData(): Promise<{ jobId: string; batchId: string }> {
  const household = await testHousehold();
  // Only ever the test household: every statement is scoped to its id.
  await clearRecipes(household);
  await db.from("ingredient_proposal").delete().eq("household_id", household);
  await db
    .from("ingredient")
    .delete()
    .eq("household_id", household)
    .in("name", ["Topinambur", "Pak Choi"]);

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
  // A test may have made "Topinambur" another name for potatoes. Undo that, or the catalog
  // would know the ingredient the next test needs to be unknown.
  const seeded = seedCatalog.ingredients.find((i) => i.id === "kartoffeln")!.synonyms;
  await db.from("ingredient").update({ synonyms: seeded }).eq("id", potato.id);
  const salt = await ingredient("Salz");

  const photoPath = `${household}/e2e/pages/0000.jpg`;
  await storeTestPhoto(photoPath, 600, 800);

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
  // A second unknown ingredient, used by no recipe line, for accepting several at once.
  const second = await db.from("ingredient_proposal").insert({
    household_id: household,
    name: "Pak Choi",
    aisle_group_id: potato.aisle_group_id,
    preferred_shop_id: potato.preferred_shop_id,
    default_unit: "Stück",
    buying_mode: "count",
    shelf_life_days: 5,
  });
  if (second.error) throw new Error(`create second proposal: ${second.error.message}`);
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

type Protein = Database["public"]["Enums"]["protein_type"];
type Unit = Database["public"]["Enums"]["unit"];

/** A small cookbook: enough meals of every kind to fill a week, and a few that are no meals. */
const LIBRARY: {
  title: string;
  category: string;
  protein: Protein;
  minutes: number | null;
  book: string;
  favorite?: boolean;
  /** What it makes when that is not four persons. */
  makes?: { count: number; unit: string };
  /** Ingredient lines: catalog name, quantity and unit. */
  lines?: [string, number | null, Unit | null][];
  /** Keys of the tags that describe it beyond its category. */
  tags?: string[];
  /** Its Arbeitsschritte, and what was not read with certainty in them. */
  steps?: string[];
  stepDoubts?: string[];
}[] = [
  {
    title: "Gemüse-Lasagne",
    category: "hauptgericht",
    protein: "vegetarian",
    minutes: 60,
    book: "E2E Kochbuch",
    favorite: true,
    tags: ["aufwendig", "auflauf", "italienisch"],
  },
  {
    title: "Käsespätzle",
    category: "hauptgericht",
    protein: "vegetarian",
    minutes: 45,
    book: "E2E Kochbuch",
    tags: ["alltag", "pasta", "deutsch"],
  },
  {
    title: "Pilzrisotto",
    category: "hauptgericht",
    protein: "vegetarian",
    minutes: 35,
    book: "E2E Kochbuch",
    steps: [
      "Pilze putzen und in Scheiben schneiden.",
      "Reis in Butter glasig dünsten, nach und nach Brühe angießen.",
      "Pilze anbraten und unter das Risotto heben.",
    ],
    tags: ["herbst", "reis", "italienisch"],
  },
  {
    title: "Kürbisgnocchi",
    category: "hauptgericht",
    protein: "vegetarian",
    minutes: 30,
    book: "E2E Kochbuch",
    tags: ["herbst", "pasta"],
  },
  {
    title: "Ofengemüse mit Feta",
    category: "hauptgericht",
    protein: "vegetarian",
    minutes: 40,
    book: "Zweites Buch",
  },
  {
    title: "Gemüsecurry",
    category: "hauptgericht",
    protein: "vegan",
    minutes: 25,
    book: "Zweites Buch",
    tags: ["asiatisch", "reis"],
  },
  {
    title: "Spinat-Cannelloni",
    category: "hauptgericht",
    protein: "vegetarian",
    minutes: 50,
    book: "Zweites Buch",
  },
  {
    title: "Linsen-Eintopf",
    category: "suppe-eintopf",
    protein: "vegan",
    minutes: 40,
    book: "Zweites Buch",
    steps: ["Linsen waschen.", "Etwa […] Minuten köcheln lassen."],
    stepDoubts: ["Schritt 2: Die Garzeit ist verwischt."],
  },
  {
    title: "Kartoffelsuppe",
    category: "suppe-eintopf",
    protein: "vegetarian",
    minutes: 35,
    book: "E2E Kochbuch",
    lines: [
      ["Kartoffeln", 1000, "g"],
      ["Karotten", 2, "Stück"],
      ["Sahne", 100, "ml"],
    ],
  },
  { title: "Tomatensalat", category: "salat", protein: "vegan", minutes: 10, book: "E2E Kochbuch" },
  {
    title: "Lachs mit Currysahne",
    category: "hauptgericht",
    protein: "fish",
    minutes: 20,
    book: "E2E Kochbuch",
  },
  {
    title: "Forelle Müllerin",
    category: "hauptgericht",
    protein: "fish",
    minutes: 25,
    book: "Zweites Buch",
    lines: [["Butter", 50, "g"]],
  },
  {
    title: "Zitronenhähnchen",
    category: "hauptgericht",
    protein: "poultry",
    minutes: 30,
    book: "E2E Kochbuch",
    tags: ["ofen"],
  },
  {
    title: "Hähnchen-Wraps",
    category: "hauptgericht",
    protein: "poultry",
    minutes: 20,
    book: "Zweites Buch",
  },
  {
    title: "Putengeschnetzeltes",
    category: "hauptgericht",
    protein: "poultry",
    minutes: 25,
    book: "Zweites Buch",
  },
  {
    title: "Pfeffersteak",
    category: "hauptgericht",
    protein: "red_meat",
    minutes: 25,
    book: "E2E Kochbuch",
    lines: [
      ["Rindersteaks", 4, "Stück"],
      ["Sahne", 200, "ml"],
      ["Salz", null, null],
    ],
  },
  {
    title: "Rindergulasch",
    category: "hauptgericht",
    protein: "red_meat",
    minutes: null,
    book: "Zweites Buch",
    tags: ["aufwendig", "deutsch"],
  },
  {
    title: "Schweinemedaillons",
    category: "hauptgericht",
    protein: "red_meat",
    minutes: 30,
    book: "Zweites Buch",
  },
  {
    title: "Wurstsalat",
    category: "vesper",
    protein: "red_meat",
    minutes: 15,
    book: "E2E Kochbuch",
  },
  {
    title: "Zitronen-Mohn-Kuchen",
    category: "kuchen",
    protein: "vegetarian",
    minutes: null,
    book: "E2E Kochbuch",
    makes: { count: 1, unit: "Springform (Ø 26 cm)" },
    lines: [
      ["Butter", 250, "g"],
      ["Eier", 4, "Stück"],
    ],
  },
];

/**
 * Known starting state for browsing and planning: the cookbook above, approved, and no week
 * plan at all.
 */
export async function resetLibrary(): Promise<void> {
  const household = await testHousehold();
  // Only ever the test household: every statement is scoped to its id.
  await clearRecipes(household);
  const goals = await db.from("household").update({ balance_targets: null }).eq("id", household);
  if (goals.error) throw new Error(`reset goals: ${goals.error.message}`);
  // Tags a test made itself go again.
  const own = await db
    .from("tag")
    .delete()
    .eq("household_id", household)
    .eq("group_name", "Eigene");
  if (own.error) throw new Error(`clear own tags: ${own.error.message}`);

  const recipes = check(
    await db
      .from("recipe")
      .insert(
        LIBRARY.map((entry) => ({
          household_id: household,
          title: entry.title,
          source_book: entry.book,
          servings_min: entry.makes?.count ?? 4,
          servings_max: entry.makes?.count ?? 4,
          servings_unit: entry.makes?.unit ?? null,
          prep_minutes: entry.minutes,
          protein_type: entry.protein,
          is_favorite: entry.favorite ?? false,
          prep_steps: entry.steps ?? null,
          prep_steps_doubts: entry.stepDoubts ?? [],
          status: "approved" as const,
        })),
      )
      .select("id, title"),
    "create library",
  );
  const idOf = new Map(recipes.map((recipe) => [recipe.title, recipe.id]));
  const tags = check(
    await db.from("tag").select("id, key").eq("household_id", household).not("key", "is", null),
    "load tags",
  );
  const tagOf = new Map(tags.map((tag) => [tag.key, tag.id]));
  const linked = await db.from("recipe_tag").insert(
    LIBRARY.map((entry) => ({
      household_id: household,
      recipe_id: idOf.get(entry.title)!,
      tag_id: tagOf.get(entry.category)!,
    })),
  );
  if (linked.error) throw new Error(`categorise library: ${linked.error.message}`);
  const described = await db.from("recipe_tag").insert(
    LIBRARY.flatMap((entry) =>
      (entry.tags ?? []).map((key) => ({
        household_id: household,
        recipe_id: idOf.get(entry.title)!,
        tag_id: tagOf.get(key)!,
      })),
    ),
  );
  if (described.error) throw new Error(`tag library: ${described.error.message}`);

  const catalog = check(
    await db.from("ingredient").select("id, name").eq("household_id", household),
    "load catalog",
  );
  const lines = LIBRARY.flatMap((entry) =>
    (entry.lines ?? []).map(([name, quantity, unit], position) => ({
      household_id: household,
      recipe_id: idOf.get(entry.title)!,
      position,
      ingredient_id: catalog.find((ingredient) => ingredient.name === name)!.id,
      quantity,
      unit,
      original_text: [quantity, unit, name].filter((part) => part !== null).join(" "),
    })),
  );
  const stored = await db.from("recipe_ingredient").insert(lines);
  if (stored.error) throw new Error(`create lines: ${stored.error.message}`);

  // Two recipes were photographed on one page. The page is framed: the first has its own
  // part cut out, the second shows the whole page.
  const pagePath = `${household}/e2e/pages/0001.jpg`;
  const cropPath = `${household}/e2e/crops/lasagne.jpg`;
  await storeTestPhoto(pagePath, 600, 800);
  await storeTestPhoto(cropPath, 600, 380);
  const framedAt = new Date().toISOString();
  const photos = await db.from("recipe_photo").insert([
    {
      household_id: household,
      recipe_id: idOf.get("Gemüse-Lasagne")!,
      storage_path: pagePath,
      crop_path: cropPath,
      framed_at: framedAt,
    },
    {
      household_id: household,
      recipe_id: idOf.get("Käsespätzle")!,
      storage_path: pagePath,
      framed_at: framedAt,
    },
  ]);
  if (photos.error) throw new Error(`create photos: ${photos.error.message}`);
}

/** Puts a recipe of the test library among the extras of a week, as "Außerdem" does. */
export async function planAsExtra(title: string, week: string): Promise<void> {
  const household = await testHousehold();
  const recipe = check(
    await db.from("recipe").select("id").eq("household_id", household).eq("title", title).single(),
    "find recipe",
  );
  const plan = check(
    await db
      .from("week_plan")
      .upsert(
        { household_id: household, week_start: week },
        { onConflict: "household_id,week_start" },
      )
      .select("id")
      .single(),
    "create week",
  );
  const planned = await db
    .from("plan_extra")
    .insert({ household_id: household, week_plan_id: plan.id, recipe_id: recipe.id, servings: 4 });
  if (planned.error) throw new Error(`plan extra: ${planned.error.message}`);
}

/**
 * Puts the test household back to how a household starts: the app's own shopping days, no
 * invitations, and nobody in it but the test user. Accounts that joined in a test are
 * removed altogether.
 */
export async function resetHousehold(): Promise<void> {
  const household = await testHousehold();
  const cleared = await db.from("household").update({ shopping_days: null }).eq("id", household);
  if (cleared.error) throw new Error(`reset shopping days: ${cleared.error.message}`);
  await db.from("household_invite").delete().eq("household_id", household);
  const members = check(
    await db.from("household_member").select("user_id").eq("household_id", household),
    "load members",
  );
  for (const member of members) {
    const { data } = await db.auth.admin.getUserById(member.user_id);
    if (!data.user || data.user.email === process.env.E2E_EMAIL) continue;
    // Only ever accounts a test made: their address says so.
    if (!data.user.email?.startsWith("e2e-gast-")) continue;
    await db.auth.admin.deleteUser(member.user_id);
  }
}

/**
 * Marks a batch as uploaded for a meal of the week plan, as the upload form does when it was
 * opened from that meal. The photos themselves are read by a model, which the tests leave out.
 */
export async function uploadIsFor(
  batchId: string,
  date: string,
  meal: "lunch" | "dinner",
): Promise<void> {
  const marked = await db
    .from("import_batch")
    .update({ for_date: date, for_meal: meal })
    .eq("id", batchId)
    .eq("household_id", await testHousehold());
  if (marked.error) throw new Error(`mark batch: ${marked.error.message}`);
}

/**
 * Signs the test user in. A device that opens the plan for the first time is asked about the
 * goals of a week; the tests are no first visit unless they say so.
 */
export async function signIn(
  page: Page,
  visit: "first" | "returning" = "returning",
): Promise<void> {
  if (visit === "returning") {
    await page.context().addCookies([
      {
        name: "ziele-gesehen",
        value: "1",
        url: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      },
    ]);
  }
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(visit === "first" ? "**/woche/ziele?start=1" : "**/woche");
}

/**
 * Takes the made-up cookbook out of the test household again: its recipes, plans, batches
 * and the tags and proposals tests made. Run after every test run, so that the recipes of
 * the "E2E Kochbuch" exist only while tests are running.
 */
export async function clearTestHousehold(): Promise<void> {
  const household = await testHousehold();
  // Only ever the test household: every statement is scoped to its id.
  await clearRecipes(household);
  const proposals = await db.from("ingredient_proposal").delete().eq("household_id", household);
  if (proposals.error) throw new Error(`clear proposals: ${proposals.error.message}`);
  const own = await db
    .from("tag")
    .delete()
    .eq("household_id", household)
    .eq("group_name", "Eigene");
  if (own.error) throw new Error(`clear own tags: ${own.error.message}`);
}
