import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "./env";

/**
 * A Supabase client with the secret key. It bypasses row level security, so every use must
 * first establish, with the session client, that the user may touch what is being touched.
 * Needed for storage: the photo bucket has no policies and is reachable only this way.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
