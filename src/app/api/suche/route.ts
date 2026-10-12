import { NextResponse } from "next/server";
import { loadSearchIndex } from "@/server/library";
import { createSessionClient } from "@/server/supabase/server";

/**
 * The household's recipes as an index the browser searches while someone types. Row level
 * security decides whose recipes these are; without a session there are none.
 */
export async function GET() {
  const db = await createSessionClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return NextResponse.json(await loadSearchIndex(db), {
    // Private, and fresh enough: a recipe added a minute ago may take a moment to be found.
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
