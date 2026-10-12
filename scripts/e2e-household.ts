import { appendFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/server/supabase/database.types";
import { seedId } from "../supabase/seed/build-seed-sql";
import { seedCatalog } from "../supabase/seed/catalog";
import { tags } from "../supabase/seed/recipes";

/**
 * Creates or removes a separate test household with its own login, for automated tests.
 * Row level security keeps it apart from the real household: the test login sees only the
 * test household, and nobody else sees that.
 *
 *   npm run e2e:setup       create it (safe to repeat) and store the login in .env.local
 *   npm run e2e:teardown    remove the household, its data, its photos and the login
 */

const HOUSEHOLD_NAME = "E2E-Test (automatisch)";
const EMAIL = "e2e-test@essensplan.example";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  process.exit(1);
}
const db = createClient<Database>(url, secret, { auth: { persistSession: false } });
const id = (kind: string, slug: string) => seedId(`e2e:${kind}`, slug);

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function findUser() {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  fail("list users", error);
  return data.users.find((user) => user.email === EMAIL) ?? null;
}

async function setup() {
  const householdId = id("household", "default");
  fail(
    "create household",
    (await db.from("household").upsert({ id: householdId, name: HOUSEHOLD_NAME })).error,
  );
  fail(
    "create shops",
    (
      await db.from("shop").upsert(
        seedCatalog.shops.map((shop) => ({
          id: id("shop", shop.id),
          household_id: householdId,
          name: shop.name,
          short_label: shop.shortLabel,
          sort_order: shop.sortOrder,
          is_default: shop.id === seedCatalog.defaultShopId,
        })),
      )
    ).error,
  );
  fail(
    "create aisle groups",
    (
      await db.from("aisle_group").upsert(
        seedCatalog.aisleGroups.map((aisle) => ({
          id: id("aisle_group", aisle.id),
          household_id: householdId,
          name: aisle.name,
          sort_order: aisle.sortOrder,
          is_fallback: aisle.id === seedCatalog.fallbackAisleGroupId,
        })),
      )
    ).error,
  );
  fail(
    "create aisle order",
    (
      await db.from("shop_aisle_order").upsert(
        seedCatalog.shops.flatMap((shop) =>
          Object.entries(shop.aisleSortOverrides).map(([aisle, sort_order]) => ({
            household_id: householdId,
            shop_id: id("shop", shop.id),
            aisle_group_id: id("aisle_group", aisle),
            sort_order,
          })),
        ),
      )
    ).error,
  );
  fail(
    "create ingredients",
    (
      await db.from("ingredient").upsert(
        seedCatalog.ingredients.map((i) => ({
          id: id("ingredient", i.id),
          household_id: householdId,
          name: i.name,
          synonyms: i.synonyms,
          aisle_group_id: id("aisle_group", i.aisleGroupId),
          preferred_shop_id: id("shop", i.preferredShopId),
          default_unit: i.defaultUnit,
          buying_mode: i.buyingMode,
          pack_size: i.packSize,
          rounding_step: i.roundingStep,
          grams_per: i.gramsPer,
          is_pantry_staple: i.isPantryStaple,
          shelf_life_days: i.shelfLifeDays,
        })),
      )
    ).error,
  );
  fail(
    "create tags",
    (
      await db.from("tag").upsert(
        tags.map((tag, sort_order) => ({
          id: id("tag", tag.id),
          household_id: householdId,
          name: tag.name,
          group_name: tag.group,
          sort_order,
        })),
      )
    ).error,
  );

  // The password lives only in .env.local. A new one is made if none is stored yet.
  let password = process.env.E2E_PASSWORD;
  if (!password) {
    password = randomBytes(18).toString("base64url");
    const env = readFileSync(".env.local", "utf8");
    appendFileSync(
      ".env.local",
      `${env.endsWith("\n") ? "" : "\n"}\n# Login of the separate test household (npm run e2e:setup)\nE2E_EMAIL=${EMAIL}\nE2E_PASSWORD=${password}\n`,
    );
  }
  let user = await findUser();
  if (user) {
    fail("update test user", (await db.auth.admin.updateUserById(user.id, { password })).error);
  } else {
    const created = await db.auth.admin.createUser({ email: EMAIL, password, email_confirm: true });
    fail("create test user", created.error);
    user = created.data.user;
  }
  fail(
    "add test user to test household",
    (
      await db
        .from("household_member")
        .upsert({ household_id: householdId, user_id: user!.id, role: "admin" })
    ).error,
  );
  console.log(
    `Test household ready: "${HOUSEHOLD_NAME}", login ${EMAIL} (password in .env.local).`,
  );
}

async function removeFolder(prefix: string): Promise<void> {
  const bucket = db.storage.from("recipe-photos");
  const { data } = await bucket.list(prefix, { limit: 1000 });
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    // An entry without an id is a folder.
    if (entry.id === null) await removeFolder(path);
    else await bucket.remove([path]);
  }
}

async function teardown() {
  const householdId = id("household", "default");
  await removeFolder(householdId);
  fail("remove test household", (await db.from("household").delete().eq("id", householdId)).error);
  const user = await findUser();
  if (user) fail("remove test user", (await db.auth.admin.deleteUser(user.id)).error);
  console.log("Test household, its data, its photos and its login are removed.");
  console.log("The E2E_EMAIL and E2E_PASSWORD lines in .env.local can be deleted.");
}

(process.argv.includes("--teardown") ? teardown() : setup()).catch((error) => {
  console.error(error);
  process.exit(1);
});
