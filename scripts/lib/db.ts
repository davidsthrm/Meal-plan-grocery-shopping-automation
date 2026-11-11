import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readPages } from "@/lib/paging";
import type { Database } from "@/server/supabase/database.types";

/**
 * The database for scripts, with the secret key: it passes row level security, so a script
 * names its household in every query. Read from .env.local (`tsx --env-file=.env.local`).
 */
export function adminDb(
  missing = "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.",
): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.error(missing);
    process.exit(1);
  }
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

/**
 * The household named as the first argument, and the arguments after it. Prints the usage
 * and ends the script when no name is given, or when no household has that name.
 */
export async function householdFromArgs(
  db: SupabaseClient<Database>,
  usage: string,
): Promise<{ householdId: string; name: string; flags: string[] }> {
  const [name, ...flags] = process.argv.slice(2);
  if (!name || name.startsWith("--")) {
    console.error(usage);
    process.exit(1);
  }
  const household = await db.from("household").select("id").eq("name", name).maybeSingle();
  if (!household.data) {
    console.error(`No household named "${name}".`);
    process.exit(1);
  }
  return { householdId: household.data.id, name, flags };
}

/**
 * Every row of a query, page by page. The API returns at most a thousand rows per request
 * and cuts a longer answer off without saying so. The query needs a unique order, or pages
 * read side by side overlap.
 */
export async function allRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  return readPages(async (from, to) => {
    const { data, error } = await page(from, to);
    if (error || !data) throw new Error(`${what}: ${error?.message ?? "no data"}`);
    return data;
  });
}
