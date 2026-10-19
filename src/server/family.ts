import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  INVITE_DAYS,
  inviteIsOpen,
  type JoinErrors,
  type JoinInput,
  type Role,
} from "@/domain/family";
import type { Household } from "./auth";
import { must, type Db } from "./catalog";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import type { Database } from "./supabase/database.types";
import { supabasePublishableKey, supabaseUrl } from "./supabase/env";

/**
 * The people of a household, and the invitations that bring in more of them. Accounts are
 * made here and nowhere else: sign-up is switched off, and only someone with an invitation
 * of a member gets one.
 */

export interface Member {
  userId: string;
  /** How the household calls them. Null until they said. */
  name: string | null;
  role: Role;
  isSelf: boolean;
}

export interface OpenInvite {
  id: string;
  expiresAt: string;
}

export async function loadMembers(db: Db, household: Pick<Household, "userId">): Promise<Member[]> {
  const rows = must(
    await db
      .from("household_member")
      .select("user_id, display_name, role, created_at")
      .order("created_at"),
    "load members",
  );
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    role: row.role,
    isSelf: row.user_id === household.userId,
  }));
}

/**
 * The signed-in member leaves the household. Only the membership goes: the account stays and
 * sees nothing any more. The database refuses the admin (`leave_household`).
 */
export async function leaveHousehold(db: Db): Promise<void> {
  const left = await db.rpc("leave_household");
  if (left.error) throw new Error(`leave household: ${left.error.message}`);
}

/** The admin removes another member from the household (`remove_household_member`). */
export async function removeMember(db: Db, userId: string): Promise<void> {
  const removed = await db.rpc("remove_household_member", { member: userId });
  if (removed.error) throw new Error(`remove member: ${removed.error.message}`);
}

/**
 * Sets how the signed-in member is called. Members may not write the member table
 * themselves, so this goes by the secret key, and only ever to the caller's own row.
 */
export async function renameSelf(
  household: Pick<Household, "id" | "userId">,
  name: string,
): Promise<void> {
  const stored = await createAdminClient()
    .from("household_member")
    .update({ display_name: name === "" ? null : name })
    .eq("household_id", household.id)
    .eq("user_id", household.userId);
  if (stored.error) throw new Error(`rename member: ${stored.error.message}`);
}

export async function loadInvites(db: Db): Promise<OpenInvite[]> {
  const rows = must(
    await db
      .from("household_invite")
      .select("id, expires_at, used_at")
      .is("used_at", null)
      .order("created_at"),
    "load invitations",
  );
  const now = new Date();
  return rows
    .filter((row) => inviteIsOpen({ usedAt: row.used_at, expiresAt: row.expires_at }, now))
    .map((row) => ({ id: row.id, expiresAt: row.expires_at }));
}

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Makes an invitation and answers with its secret, which is part of the link and is shown
 * once. Only its hash is kept, so the table alone lets nobody in.
 */
export async function createInvite(
  db: Db,
  household: Pick<Household, "id" | "userId">,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const stored = await db.from("household_invite").insert({
    household_id: household.id,
    token_hash: hashOf(token),
    created_by: household.userId,
    expires_at: expires.toISOString(),
  });
  if (stored.error) throw new Error(`create invitation: ${stored.error.message}`);
  return token;
}

export async function withdrawInvite(db: Db, id: string): Promise<void> {
  const removed = await db.from("household_invite").delete().eq("id", id);
  if (removed.error) throw new Error(`withdraw invitation: ${removed.error.message}`);
}

/**
 * The household an invitation leads into, for someone who holds its secret and is no member
 * yet. Knowing the secret is what gives access here, so this reads with the secret key.
 */
export async function findInvite(token: string): Promise<{
  id: string;
  householdId: string;
  householdName: string;
  /** How the household calls whoever made the invitation. Null when nobody knows. */
  inviterName: string | null;
} | null> {
  if (!/^[\w-]{20,80}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("household_invite")
    .select("id, household_id, created_by, expires_at, used_at")
    .eq("token_hash", hashOf(token))
    .maybeSingle();
  if (!invite) return null;
  if (!inviteIsOpen({ usedAt: invite.used_at, expiresAt: invite.expires_at }, new Date())) {
    return null;
  }
  const [{ data: household }, { data: inviter }] = await Promise.all([
    admin.from("household").select("name").eq("id", invite.household_id).maybeSingle(),
    invite.created_by
      ? admin
          .from("household_member")
          .select("display_name")
          .eq("household_id", invite.household_id)
          .eq("user_id", invite.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!household) return null;
  return {
    id: invite.id,
    householdId: invite.household_id,
    householdName: household.name,
    inviterName: inviter?.display_name ?? null,
  };
}

/**
 * Uses an invitation: makes an account for whoever holds it and puts it into the household.
 * An account that belongs to no household (it left one, or was removed) joins with its own
 * password instead. The invitation is taken first, so that it works once however many
 * requests arrive, and is given back if nobody joins.
 */
export async function acceptInvite(token: string, input: JoinInput): Promise<JoinErrors | null> {
  const invite = await findInvite(token);
  const gone = { invite: "Diese Einladung gilt nicht mehr. Bitte um eine neue." };
  if (!invite) return gone;
  const admin = createAdminClient();
  const taken = await admin
    .from("household_invite")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("used_at", null)
    .select("id");
  if (taken.error || taken.data.length === 0) return gone;
  const giveBack = () =>
    admin.from("household_invite").update({ used_at: null }).eq("id", invite.id);
  const failed = {
    invite: "Das Konto konnte nicht angelegt werden. Bitte versuche es noch einmal.",
  };

  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    // Whoever holds the link was invited by a member: no letter to confirm the address.
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  let userId = created.data.user?.id ?? null;
  const known = created.error?.code === "email_exists" || created.error?.status === 422;
  if (!userId && known) {
    const existing = await accountWithoutHousehold(input);
    if (typeof existing !== "string") {
      await giveBack();
      return existing;
    }
    userId = existing;
  } else if (!userId) {
    await giveBack();
    return failed;
  }
  const joined = await admin.from("household_member").insert({
    household_id: invite.householdId,
    user_id: userId,
    role: "member",
    display_name: input.name,
  });
  if (joined.error) {
    // No new account without a household: it could sign in and would see nothing.
    if (!known) await admin.auth.admin.deleteUser(userId);
    await giveBack();
    return failed;
  }
  await admin.from("household_invite").update({ used_by: userId }).eq("id", invite.id);
  return null;
}

/**
 * The account of an address that has one, when the password is its own and it belongs to
 * no household: it may use the invitation. Answers its id, or what the form says instead.
 * The password is checked by signing in on a client of its own, which keeps no session.
 */
async function accountWithoutHousehold(input: JoinInput): Promise<string | JoinErrors> {
  const check = createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await check.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  const userId = signedIn.data.user?.id;
  if (!userId) {
    return {
      email:
        "Für diese E-Mail gibt es schon ein Konto. Gib sein Passwort ein, um damit dazuzukommen.",
    };
  }
  // Only the session made for this check ends; the account's others stay.
  await check.auth.signOut({ scope: "local" });
  const { data: member } = await createAdminClient()
    .from("household_member")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (member) return { email: "Dieses Konto gehört schon zu einem Haushalt. Melde dich damit an." };
  return userId;
}
