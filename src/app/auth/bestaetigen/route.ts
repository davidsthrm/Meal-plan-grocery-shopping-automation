import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { NEW_PASSWORD_PAGE } from "@/server/password";
import { createSessionClient } from "@/server/supabase/server";

/**
 * Where the link of a "Passwort vergessen" e-mail leads. It signs in whoever holds the link
 * and asks for a new password. Two kinds of link arrive: one with a code, which works only
 * in the browser that asked for it, and one with the hashed token (Supabase's e-mail
 * template set to `token_hash`), which works on any device.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const db = await createSessionClient();
  const code = query.get("code");
  const tokenHash = query.get("token_hash");
  const verified = code
    ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && query.get("type") === "recovery"
      ? await db.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })
      : null;
  if (!verified || verified.error) {
    if (verified?.error) console.error(`password reset link: ${verified.error.message}`);
    redirect("/passwort-vergessen?fehler=link");
  }
  redirect(NEW_PASSWORD_PAGE);
}
