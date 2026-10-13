/**
 * A family shares one household. Everyone has an account of their own and sees the same
 * plan, lists and favourites. A member invites the others with a link.
 */

/** An invitation is good for this many days. */
export const INVITE_DAYS = 7;

const NAME_LENGTH = 40;
const PASSWORD_LENGTH = 8;

export interface JoinInput {
  name: string;
  email: string;
  password: string;
}

export type JoinErrors = Partial<Record<keyof JoinInput | "invite", string>>;

/** A name as a household shows it: without stray spaces, and not endless. */
export function readName(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, NAME_LENGTH);
}

/**
 * What someone typed to join a household, tidied, or what is wrong with it. The messages
 * are the ones the form shows.
 */
export function readJoin(input: Record<keyof JoinInput, string>): {
  value: JoinInput | null;
  errors: JoinErrors;
} {
  const value = {
    name: readName(input.name),
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
  const errors: JoinErrors = {};
  if (value.name === "") errors.name = "Bitte einen Namen eingeben.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
    errors.email = "Das ist keine E-Mail-Adresse.";
  }
  if (value.password.length < PASSWORD_LENGTH) {
    errors.password = `Das Passwort braucht mindestens ${PASSWORD_LENGTH} Zeichen.`;
  }
  return { value: Object.keys(errors).length === 0 ? value : null, errors };
}

/** Whether an invitation still works on a day: not used, and not older than it may be. */
export function inviteIsOpen(
  invite: { usedAt: string | null; expiresAt: string },
  now: Date,
): boolean {
  return invite.usedAt === null && new Date(invite.expiresAt).getTime() > now.getTime();
}
