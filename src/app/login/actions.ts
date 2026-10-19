"use server";

import { redirect } from "next/navigation";
import { readEmail, readNewPassword } from "@/domain/family";
import { mayUseDeployment } from "@/lib/preview";
import { sendPasswordReset, storeNewPassword } from "@/server/password";
import { createSessionClient } from "@/server/supabase/server";

export interface LoginState {
  error: string | null;
  email: string;
}

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben.", email };
  if (!mayUseDeployment(email)) {
    return { error: "In dieser Vorschau kann sich nur der Test-Haushalt anmelden.", email };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // One message for every failure: it must not reveal whether an address has an account.
  if (error) return { error: "E-Mail oder Passwort stimmt nicht.", email };
  redirect("/");
}

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface ResetState {
  /** What the page says after sending: a message to show, or null before anything was sent. */
  said: { kind: "sent" | "error"; text: string } | null;
  email: string;
}

/** Sends the link for a new password. The answer never says whether the address has an account. */
export async function requestPasswordReset(
  _previous: ResetState,
  form: FormData,
): Promise<ResetState> {
  const typed = String(form.get("email") ?? "");
  const email = readEmail(typed);
  if (!email)
    return { said: { kind: "error", text: "Das ist keine E-Mail-Adresse." }, email: typed };
  const sent = await sendPasswordReset(email);
  if (sent === "too-many") {
    return {
      said: {
        kind: "error",
        text: "Gerade wurden zu viele E-Mails verschickt. Bitte versuche es in einer Stunde noch einmal.",
      },
      email,
    };
  }
  return {
    said: {
      kind: "sent",
      text: `Wenn es für ${email} ein Konto gibt, kommt gleich eine E-Mail mit einem Link. Er gilt eine Stunde.`,
    },
    email,
  };
}

export interface PasswordState {
  error: string | null;
}

/** Sets the new password after the link of the e-mail signed in, and opens the app. */
export async function setNewPassword(
  _previous: PasswordState,
  form: FormData,
): Promise<PasswordState> {
  const next = String(form.get("password") ?? "");
  const wrong = readNewPassword(next, String(form.get("repeated") ?? ""));
  if (wrong) return { error: wrong };
  const failed = await storeNewPassword(next);
  if (failed) return { error: failed };
  redirect("/");
}
