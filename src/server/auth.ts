import "server-only";
import { redirect } from "next/navigation";
import { createSessionClient } from "./supabase/server";

export interface Household {
  id: string;
  name: string;
  defaultServings: number;
  userId: string;
}

/**
 * The household of the signed-in user, for pages and actions that need one. Redirects to the
 * login page without a session. A signed-in user without a household sees nothing, by design:
 * accounts are created by invite and added to the household by hand.
 */
export async function requireHousehold(): Promise<Household> {
  const supabase = await createSessionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data, error } = await supabase
    .from("household")
    .select("id, name, default_servings")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`could not load the household: ${error.message}`);
  if (!data) redirect("/kein-haushalt");
  return { id: data.id, name: data.name, defaultServings: data.default_servings, userId };
}
