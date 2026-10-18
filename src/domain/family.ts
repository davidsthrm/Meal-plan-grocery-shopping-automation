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
  if (readEmail(value.email) === null) errors.email = "Das ist keine E-Mail-Adresse.";
  if (value.password.length < PASSWORD_LENGTH) {
    errors.password = `Das Passwort braucht mindestens ${PASSWORD_LENGTH} Zeichen.`;
  }
  return { value: Object.keys(errors).length === 0 ? value : null, errors };
}

/**
 * A new password as it is typed twice, or what is wrong with it: the messages the form
 * shows. Used when a member changes their password and after "Passwort vergessen".
 */
export function readNewPassword(password: string, repeated: string): string | null {
  if (password.length < PASSWORD_LENGTH) {
    return `Das neue Passwort braucht mindestens ${PASSWORD_LENGTH} Zeichen.`;
  }
  if (password !== repeated) return "Die beiden Passwörter sind nicht gleich.";
  return null;
}

/** An e-mail address as it is typed into a form, or null for anything that is none. */
export function readEmail(text: string): string | null {
  const email = text.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** A household has one admin, whoever made it. Everyone else is a member. */
export type Role = "admin" | "member";

/**
 * Whether someone can leave their household: everyone but the admin, who would leave nobody
 * behind to look after the members.
 */
export function canLeave(role: Role): boolean {
  return role === "member";
}

/** Whether the one looking at the family can remove a member of it: the admin, anyone else. */
export function canRemove(viewer: Role, member: { isSelf: boolean }): boolean {
  return viewer === "admin" && !member.isSelf;
}

/** Whether an invitation still works on a day: not used, and not older than it may be. */
export function inviteIsOpen(
  invite: { usedAt: string | null; expiresAt: string },
  now: Date,
): boolean {
  return invite.usedAt === null && new Date(invite.expiresAt).getTime() > now.getTime();
}

/**
 * Words a household may be called that are no family name: they are never turned into
 * "die Zuhauses".
 */
const NOT_A_FAMILY = new Set(["zuhause", "daheim", "haushalt", "familie", "home", "wir"]);

/**
 * The household's name as the family is spoken of: "Stührmann" becomes "Stührmanns", as in
 * "bei den Stührmanns". A name already ending in an s sound stays as it is ("Fuchs"). Null
 * for a name that is no single family name ("Zuhause", "E2E-Test (automatisch)"): the page
 * then says what it says without it.
 */
export function familyName(householdName: string): string | null {
  const name = householdName.trim();
  if (!/^\p{Lu}[\p{Ll}ß]+(?:-\p{Lu}[\p{Ll}ß]+)?$/u.test(name)) return null;
  if (NOT_A_FAMILY.has(name.toLowerCase())) return null;
  return /(?:s|ß|x|z)$/.test(name) ? name : `${name}s`;
}

/** How a member is greeted: the first word of the name they gave. Null without a name. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * The letter that stands for a member in the header, on the way to the settings: "D" for
 * "David Stührmann". Null without a name.
 */
export function initialOf(displayName: string | null | undefined): string | null {
  const first = firstName(displayName);
  return first ? [...first][0].toLocaleUpperCase("de") : null;
}

/**
 * How a member is greeted at this hour where the household lives: "Guten Morgen" until
 * eleven, "Guten Abend" from six in the evening, "Hallo" in between and at night.
 */
export function salutation(hour: number): string {
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 18 && hour < 23) return "Guten Abend";
  return "Hallo";
}
