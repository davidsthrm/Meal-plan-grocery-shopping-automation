"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/server/supabase/server";

export interface LoginState {
  error: string | null;
  email: string;
}

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben.", email };

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
