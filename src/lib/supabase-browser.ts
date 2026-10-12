import { createBrowserClient } from "@supabase/ssr";

/** The Supabase client for the browser. It only ever holds the publishable key. */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
