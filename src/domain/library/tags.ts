import type { RecipeSummary } from "./summary";

/**
 * What a recipe is like beyond its category: how much work it is, what kind of dish, which
 * cuisine, season and occasion. The app suggests these tags; the household changes them per
 * recipe and can add its own.
 */

/** A tag as the app refers to it: by its key, or by its id when the household made it. */
export interface Tag {
  ref: string;
  name: string;
  group: string;
}

export interface TagGroup {
  name: string;
  tags: Tag[];
}

/** The groups a recipe is described by, in the order they are shown. */
export const TAG_GROUPS = ["Aufwand", "Gericht", "Küche", "Saison", "Anlass", "Eigene"] as const;
/** The group for tags the household adds itself. */
export const OWN_GROUP = "Eigene";
/** Groups in which a recipe has one tag at most: it is quick or it takes time, not both. */
export const SINGLE_GROUPS: ReadonlySet<string> = new Set(["Aufwand", "Küche"]);

/** Sorts tags into their groups. Tags of other groups (category, diet) are left out. */
export function groupTags(tags: readonly Tag[]): TagGroup[] {
  return TAG_GROUPS.map((name) => ({
    name,
    tags: tags.filter((tag) => tag.group === name),
  })).filter((group) => group.tags.length > 0);
}

/**
 * How much work a recipe is: "schnell" is on the table in about half an hour, "alltag" fits
 * a normal day, "aufwendig" needs a long time or many steps.
 */
export const EFFORTS = ["schnell", "alltag", "aufwendig"] as const;
export type Effort = (typeof EFFORTS)[number];

const QUICK_MINUTES = 30;
const EVERYDAY_MINUTES = 60;

/**
 * A recipe's effort. Its tag says so; without one, the printed time does. A recipe with
 * neither is not known to be quick.
 */
export function effortOf(recipe: Pick<RecipeSummary, "tags" | "prepMinutes">): Effort | null {
  const tagged = EFFORTS.find((effort) => recipe.tags.includes(effort));
  if (tagged) return tagged;
  if (recipe.prepMinutes === null) return null;
  if (recipe.prepMinutes <= QUICK_MINUTES) return "schnell";
  return recipe.prepMinutes <= EVERYDAY_MINUTES ? "alltag" : "aufwendig";
}

/**
 * The tags of a recipe after one was switched on or off. In a group that allows one tag, the
 * new one replaces the old.
 */
export function toggleTag(own: readonly string[], tag: Tag, all: readonly Tag[]): string[] {
  if (own.includes(tag.ref)) return own.filter((ref) => ref !== tag.ref);
  const rivals = SINGLE_GROUPS.has(tag.group)
    ? new Set(all.filter((other) => other.group === tag.group).map((other) => other.ref))
    : new Set<string>();
  return [...own.filter((ref) => !rivals.has(ref)), tag.ref];
}

/**
 * The tags to store for a recipe from what was chosen: only tags that exist, each once, and
 * in a group that allows one tag the last one chosen.
 */
export function chosenTags(chosen: readonly string[], all: readonly Tag[]): string[] {
  const known = new Map(all.map((tag) => [tag.ref, tag]));
  let kept: string[] = [];
  for (const ref of chosen) {
    const tag = known.get(ref);
    if (!tag || kept.includes(ref)) continue;
    if (SINGLE_GROUPS.has(tag.group)) {
      kept = kept.filter((other) => known.get(other)?.group !== tag.group);
    }
    kept.push(ref);
  }
  return kept;
}

const OWN_TAG_LENGTH = 30;
const OWN_TAGS_AT_ONCE = 5;

/** Tags the household types itself, separated by commas: "Omas Rezept, Kindergeburtstag". */
export function readOwnTags(text: string): string[] {
  const names: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const name = part.trim().replace(/\s+/g, " ").slice(0, OWN_TAG_LENGTH);
    const seen = names.some((other) => other.toLowerCase() === name.toLowerCase());
    if (name !== "" && !seen) names.push(name);
  }
  return names.slice(0, OWN_TAGS_AT_ONCE);
}
