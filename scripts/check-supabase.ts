import { createClient } from "@supabase/supabase-js";
import { seedCatalog } from "../supabase/seed/catalog";
import { seedRecipes } from "../supabase/seed/recipes";

/**
 * Checks that the Supabase project in .env.local is set up the way the app expects:
 * schema and seed are in, the server key works, visitors without a login see nothing,
 * and public sign-up is off.
 *
 *   npm run db:check
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SECRET_KEY: secretKey,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (!url || !publishableKey || !secretKey) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const server = createClient(url, secretKey, options);
const visitor = createClient(url, publishableKey, options);

let failed = false;
function report(ok: boolean, text: string) {
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "FAIL"}  ${text}`);
}

async function countRows(client: typeof server, table: string) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  return { count, error };
}

async function main() {
  const ingredients = await countRows(server, "ingredient");
  report(
    ingredients.count === seedCatalog.ingredients.length,
    `ingredients in the catalog: ${ingredients.count ?? ingredients.error?.message} (expected ${seedCatalog.ingredients.length})`,
  );

  const recipes = await countRows(server, "recipe");
  report(
    recipes.count === seedRecipes.length,
    `seed recipes: ${recipes.count ?? recipes.error?.message} (expected ${seedRecipes.length})`,
  );

  const households = await countRows(server, "household");
  report(
    households.count === 1,
    `households: ${households.count ?? households.error?.message} (expected 1)`,
  );

  const members = await countRows(server, "household_member");
  report(
    (members.count ?? 0) >= 1,
    `household members: ${members.count ?? members.error?.message} (at least 1, otherwise nobody can see any data)`,
  );

  // Without a login nothing may be readable: either the request is refused or it is empty.
  const anonymous = await visitor.from("ingredient").select("id").limit(1);
  report(
    anonymous.error !== null || (anonymous.data ?? []).length === 0,
    `visitor without login reads ingredients: ${anonymous.error ? `refused (${anonymous.error.message})` : `${anonymous.data?.length} rows`}`,
  );

  const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey! } });
  if (settings.ok) {
    const body = (await settings.json()) as { disable_signup?: boolean };
    report(body.disable_signup === true, `public sign-up disabled: ${body.disable_signup}`);
  } else {
    report(false, `could not read the auth settings (HTTP ${settings.status})`);
  }

  console.log(
    failed
      ? "\nSomething is not set up yet. See README, section Supabase."
      : "\nSupabase is ready.",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
