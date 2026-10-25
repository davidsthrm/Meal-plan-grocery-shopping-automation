import { searchKey } from "./filter";
import { OWN_GROUP, SINGLE_GROUPS } from "./tags";

/**
 * Looking after the tags themselves rather than a recipe's: renaming, merging two into one,
 * deleting and moving the household's own into another group. The app finds its own tags by
 * their key ("schnell", "hauptgericht"), so a name can change freely; a tag with a key never
 * goes away, or the week plan would lose what tells it a recipe is quick.
 */

/** A tag as it is stored. Its key is set for the app's own tags and null for the household's. */
export interface StoredTag {
  id: string;
  key: string | null;
  name: string;
  group: string;
}

/** That a recipe carries a tag. */
export interface TagLink {
  recipeId: string;
  tagId: string;
}

/** The group of the categories: one per recipe, renamed at most. */
export const CATEGORY_GROUP = "Kategorie";

/** The groups a tag of the household's own can be moved into. "Aufwand" is the app's three. */
export const MOVABLE_GROUPS = [
  "Gericht",
  "Hauptzutat",
  "Küche",
  "Saison",
  "Anlass",
  OWN_GROUP,
] as const;

/** As long as a tag the household types may be (`readOwnTags`). */
export const TAG_NAME_MAX = 30;

export type Outcome<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const done = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (error: string): Outcome<never> => ({ ok: false, error });

/** A name as the household typed it, tidied: no spaces at the ends or twice, not too long. */
export function cleanTagName(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, TAG_NAME_MAX).trim();
}

/**
 * A name as two tags are compared: without case, umlauts, spaces or punctuation. "Omas
 * Rezept", "omas-rezept" and "Omas Rezept!" are one tag.
 */
export function tagKey(name: string): string {
  return searchKey(name);
}

/**
 * The fewest changes that turn one text into the other: a letter added, left out or swapped
 * for another, or two neighbouring letters the wrong way round.
 */
export function editDistance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push([i]);
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        rows[i][j] = j;
        continue;
      }
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/**
 * How many letters two names of a tag may differ in and still be one: "Oma Rezept" is "Omas
 * Rezept", but "Reis" is not "Eis". Short names must be the same.
 */
function slack(key: string): number {
  if (key.length >= 10) return 2;
  return key.length >= 5 ? 1 : 0;
}

/**
 * The existing tag a typed name means: one of the same name however it is written, or one a
 * letter or two away from it. Null when the name is new.
 */
export function similarTag<T extends Pick<StoredTag, "name">>(
  name: string,
  tags: readonly T[],
): T | null {
  const typed = tagKey(name);
  if (typed === "") return null;
  const same = tags.find((tag) => tagKey(tag.name) === typed);
  if (same) return same;
  let best: { tag: T; distance: number } | null = null;
  for (const tag of tags) {
    const other = tagKey(tag.name);
    const distance = editDistance(typed, other);
    if (distance > Math.min(slack(typed), slack(other))) continue;
    if (!best || distance < best.distance) best = { tag, distance };
  }
  return best?.tag ?? null;
}

/**
 * Tags to offer while a name is typed: those it starts, then those it is part of, then those
 * it nearly is. The household picks one instead of making a second of almost the same name.
 */
export function suggestTags<T extends Pick<StoredTag, "name">>(
  text: string,
  tags: readonly T[],
  limit = 6,
): T[] {
  const typed = tagKey(text);
  if (typed === "") return [];
  const rank = (tag: T): number | null => {
    const key = tagKey(tag.name);
    if (key.startsWith(typed)) return 0;
    // Any word of the name may be the one typed: "rezept" finds "Omas Rezept".
    if (tag.name.split(/[\s,&/-]+/).some((word) => tagKey(word).startsWith(typed))) {
      return 1;
    }
    if (typed.length >= 3 && key.includes(typed)) return 2;
    return similarTag(text, [tag]) ? 3 : null;
  };
  return tags
    .flatMap((tag) => {
      const at = rank(tag);
      return at === null ? [] : [{ tag, at }];
    })
    .sort((a, b) => a.at - b.at || a.tag.name.localeCompare(b.tag.name, "de"))
    .slice(0, limit)
    .map((entry) => entry.tag);
}

/** How many recipes carry each tag, by its id. */
export function tagCounts(links: readonly TagLink[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const link of links) counts.set(link.tagId, (counts.get(link.tagId) ?? 0) + 1);
  return counts;
}

/** Whether a tag is the household's own: made by it, without a key the app goes by. */
export function isOwnTag(tag: StoredTag): boolean {
  return tag.key === null && tag.group !== CATEGORY_GROUP;
}

/**
 * A new name for a tag. Every tag can be renamed, a category too: the app finds it by its
 * key. A name another tag has already is refused; those two are merged instead.
 */
export function checkRename(
  tag: StoredTag,
  text: string,
  tags: readonly StoredTag[],
): Outcome<string> {
  const name = cleanTagName(text);
  if (tagKey(name) === "") return refused("Ein Stichwort braucht einen Namen.");
  const taken = tags.find((other) => other.id !== tag.id && tagKey(other.name) === tagKey(name));
  if (taken) {
    return refused(
      isOwnTag(tag)
        ? `„${taken.name}“ gibt es schon. Führe die beiden zusammen.`
        : `„${taken.name}“ gibt es schon.`,
    );
  }
  return done(name);
}

/**
 * Recipes that would carry two tags of a group that allows one: those with `tag` and another
 * tag of `group` than `except`.
 */
function twiceIn(
  group: string,
  tag: StoredTag,
  except: StoredTag | null,
  tags: readonly StoredTag[],
  links: readonly TagLink[],
): number {
  if (!SINGLE_GROUPS.has(group)) return 0;
  const rivals = new Set(
    tags
      .filter((other) => other.group === group && other.id !== tag.id && other.id !== except?.id)
      .map((other) => other.id),
  );
  const carrying = new Set(links.filter((l) => l.tagId === tag.id).map((l) => l.recipeId));
  const clashing = new Set(
    links.filter((l) => carrying.has(l.recipeId) && rivals.has(l.tagId)).map((l) => l.recipeId),
  );
  return clashing.size;
}

const recipesText = (count: number) => (count === 1 ? "1 Rezept hätte" : `${count} Rezepte hätten`);

/**
 * Merging `from` into `into`: every recipe with `from` gets `into`, and `from` goes. Only a
 * tag of the household's own goes; a tag of the app's stays, so it can only be what another
 * is merged into. Returns the recipes that get `into`, those that have it already left out.
 */
export function planMerge(
  from: StoredTag,
  into: StoredTag,
  tags: readonly StoredTag[],
  links: readonly TagLink[],
): Outcome<string[]> {
  if (from.id === into.id) return refused("Wähle ein anderes Stichwort zum Zusammenführen.");
  if (!isOwnTag(from)) {
    return refused(`„${from.name}“ gehört zur App und bleibt. Führe ein anderes mit ihm zusammen.`);
  }
  if (into.group === CATEGORY_GROUP) {
    return refused("Mit einer Kategorie lässt sich kein Stichwort zusammenführen.");
  }
  const clashing = twiceIn(into.group, from, into, tags, links);
  if (clashing > 0) {
    return refused(
      `${recipesText(clashing)} dann zwei Stichworte unter „${into.group}“. Dort hat ein Rezept nur eines.`,
    );
  }
  const has = new Set(links.filter((l) => l.tagId === into.id).map((l) => l.recipeId));
  return done(
    [...new Set(links.filter((l) => l.tagId === from.id).map((l) => l.recipeId))].filter(
      (recipe) => !has.has(recipe),
    ),
  );
}

/** Moving a tag of the household's own into another group. */
export function checkMove(
  tag: StoredTag,
  group: string,
  tags: readonly StoredTag[],
  links: readonly TagLink[],
): Outcome<string> {
  if (!isOwnTag(tag)) return refused(`„${tag.name}“ gehört zur App und bleibt in seiner Gruppe.`);
  if (!(MOVABLE_GROUPS as readonly string[]).includes(group)) {
    return refused("In diese Gruppe lässt sich kein Stichwort verschieben.");
  }
  const clashing = twiceIn(group, tag, null, tags, links);
  if (clashing > 0) {
    return refused(
      `${recipesText(clashing)} dann zwei Stichworte unter „${group}“. Dort hat ein Rezept nur eines.`,
    );
  }
  return done(group);
}

/** Deleting a tag: only one of the household's own. Its recipes lose it, nothing else. */
export function checkDelete(tag: StoredTag): Outcome {
  return isOwnTag(tag)
    ? done(undefined)
    : refused(`„${tag.name}“ gehört zur App und lässt sich nur umbenennen.`);
}
