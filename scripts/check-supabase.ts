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

// The dashboard shows the address of the Data API, which ends in /rest/v1/. The app needs the
// bare project address.
if (new URL(url).pathname !== "/") {
  console.error(
    `NEXT_PUBLIC_SUPABASE_URL must be the project address without a path: ${new URL(url).origin}`,
  );
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

/** Returns the row count, or a short description of why it could not be read. */
async function countRows(client: typeof server, table: string): Promise<number | string> {
  const { count, error, status } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  return count ?? `not readable, HTTP ${status}${error?.message ? `, ${error.message}` : ""}`;
}

async function main() {
  const ingredients = await countRows(server, "ingredient");
  report(
    ingredients === seedCatalog.ingredients.length,
    `ingredients in the catalog: ${ingredients} (expected ${seedCatalog.ingredients.length})`,
  );

  const recipes = await countRows(server, "recipe");
  report(
    recipes === seedRecipes.length,
    `seed recipes: ${recipes} (expected ${seedRecipes.length})`,
  );

  const households = await countRows(server, "household");
  report(households === 1, `households: ${households} (expected 1)`);

  const members = await countRows(server, "household_member");
  report(
    typeof members === "number" && members >= 1,
    `household members: ${members} (at least 1, otherwise nobody can see any data)`,
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
    report(
      body.disable_signup === true,
      body.disable_signup === true
        ? "public sign-up is switched off"
        : 'public sign-up is still on: switch off "Allow new users to sign up" under Authentication > Sign In / Providers and save',
    );
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
