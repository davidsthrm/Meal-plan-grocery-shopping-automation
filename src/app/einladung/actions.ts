"use server";

import { redirect } from "next/navigation";
import { readJoin, type JoinErrors } from "@/domain/family";
import { isPreview } from "@/lib/preview";
import { acceptInvite } from "@/server/family";
import { createSessionClient } from "@/server/supabase/server";

export interface JoinState {
  errors: JoinErrors;
  name: string;
  email: string;
}

/**
 * Joins the household an invitation leads into: makes the account, signs it in and opens
 * the app. The secret of the link is checked again here, where it counts.
 */
export async function joinHousehold(
  token: string,
  _previous: JoinState,
  form: FormData,
): Promise<JoinState> {
  const typed = {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  };
  const keep = { name: typed.name, email: typed.email };
  // The proxy keeps previews off this page; this is where it counts.
  if (isPreview())
    return { errors: { invite: "Einladungen gelten nur in der App selbst." }, ...keep };
  const { value, errors } = readJoin(typed);
  if (!value) return { errors, ...keep };
  const failed = await acceptInvite(token, value);
  if (failed) return { errors: failed, ...keep };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: value.email,
    password: value.password,
  });
  // The account exists either way. Without a session the login page takes over.
  redirect(error ? "/login" : "/");
}
