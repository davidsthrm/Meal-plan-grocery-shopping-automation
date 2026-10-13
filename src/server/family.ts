import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { INVITE_DAYS, inviteIsOpen, type JoinErrors, type JoinInput } from "@/domain/family";
import type { Household } from "./auth";
import { must, type Db } from "./catalog";
import { createAdminClient } from "./supabase/admin";

/**
 * The people of a household, and the invitations that bring in more of them. Accounts are
 * made here and nowhere else: sign-up is switched off, and only someone with an invitation
 * of a member gets one.
 */

export interface Member {
  userId: string;
  /** How the household calls them. Null until they said. */
  name: string | null;
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
      .select("user_id, display_name, created_at")
      .order("created_at"),
    "load members",
  );
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    isSelf: row.user_id === household.userId,
  }));
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
export async function findInvite(
  token: string,
): Promise<{ id: string; householdId: string; householdName: string } | null> {
  if (!/^[\w-]{20,80}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("household_invite")
    .select("id, household_id, expires_at, used_at")
    .eq("token_hash", hashOf(token))
    .maybeSingle();
  if (!invite) return null;
  if (!inviteIsOpen({ usedAt: invite.used_at, expiresAt: invite.expires_at }, new Date())) {
    return null;
  }
  const { data: household } = await admin
    .from("household")
    .select("name")
    .eq("id", invite.household_id)
    .maybeSingle();
  if (!household) return null;
  return { id: invite.id, householdId: invite.household_id, householdName: household.name };
}

/**
 * Uses an invitation: makes an account for whoever holds it and puts it into the household.
 * The invitation is taken first, so that it works once however many requests arrive, and is
 * given back if the account cannot be made.
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

  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    // Whoever holds the link was invited by a member: no letter to confirm the address.
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (created.error || !created.data.user) {
    await giveBack();
    const known = created.error?.code === "email_exists" || created.error?.status === 422;
    return known
      ? { email: "Für diese E-Mail gibt es schon ein Konto. Melde dich damit an." }
      : { invite: "Das Konto konnte nicht angelegt werden. Bitte versuche es noch einmal." };
  }
  const userId = created.data.user.id;
  const joined = await admin.from("household_member").insert({
    household_id: invite.householdId,
    user_id: userId,
    role: "member",
    display_name: input.name,
  });
  if (joined.error) {
    // No account without a household: it could sign in and would see nothing.
    await admin.auth.admin.deleteUser(userId);
    await giveBack();
    return { invite: "Das Konto konnte nicht angelegt werden. Bitte versuche es noch einmal." };
  }
  await admin.from("household_invite").update({ used_by: userId }).eq("id", invite.id);
  return null;
}
