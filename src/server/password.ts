import "server-only";
import { requestOrigin } from "./origin";
import { createSessionClient } from "./supabase/server";

/**
 * Passwords are Supabase Auth's: changed by a signed-in member, or set again after
 * "Passwort vergessen" from a link that Supabase sends by e-mail.
 */

/** Where the link of a reset e-mail leads: it signs in and asks for the new password. */
export const RESET_LANDING = "/auth/bestaetigen";
export const NEW_PASSWORD_PAGE = "/passwort-neu";

/**
 * Changes the signed-in member's password after checking the one they have now, so that a
 * phone left open is not enough to take over the account. Answers what went wrong, in the
 * words of the form, or null.
 */
export async function changePassword(current: string, next: string): Promise<string | null> {
  const db = await createSessionClient();
  const { data } = await db.auth.getUser();
  const email = data.user?.email;
  if (!email) return "Du bist nicht mehr angemeldet. Bitte melde dich neu an.";
  const checked = await db.auth.signInWithPassword({ email, password: current });
  if (checked.error) return "Das jetzige Passwort stimmt nicht.";
  return storeNewPassword(next);
}

/** Sets the password of whoever is signed in: after a reset link, or from `changePassword`. */
export async function storeNewPassword(next: string): Promise<string | null> {
  const db = await createSessionClient();
  const { error } = await db.auth.updateUser({ password: next });
  if (!error) return null;
  if (error.code === "same_password") return "Das neue Passwort ist dasselbe wie das alte.";
  if (error.code === "weak_password") return "Dieses Passwort ist zu leicht zu erraten.";
  console.error(`store new password: ${error.message}`);
  return "Das Passwort konnte nicht gespeichert werden. Bitte versuche es noch einmal.";
}

/**
 * Asks Supabase to send a link to set a new password. Whether an account has this address
 * is never said: the answer is the same either way. Only a refusal to send at all, when too
 * many e-mails went out, is told, or nobody would know why none arrives.
 */
export async function sendPasswordReset(email: string): Promise<"sent" | "too-many"> {
  const db = await createSessionClient();
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}${RESET_LANDING}`,
  });
  if (!error) return "sent";
  if (error.status === 429 || error.code === "over_email_send_rate_limit") return "too-many";
  // Anything else (an unknown address included, should Supabase ever say so) looks sent.
  console.error(`send password reset: ${error.message}`);
  return "sent";
}
