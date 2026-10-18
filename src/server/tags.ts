import "server-only";
import {
  CATEGORY_GROUP,
  checkDelete,
  checkMove,
  checkRename,
  cleanTagName,
  planMerge,
  similarTag,
  type Outcome,
  type StoredTag,
  type TagLink,
} from "@/domain/library/tag-admin";
import { OWN_GROUP, SINGLE_GROUPS, TAG_GROUPS } from "@/domain/library/tags";
import { allRows, must, type Db } from "./catalog";

/**
 * The tags themselves, as the household looks after them: the categories and the groups that
 * describe a recipe. Diets and older groups the app no longer shows are left alone. Which
 * household is decided by row level security.
 */

const SHOWN_GROUPS: readonly string[] = [CATEGORY_GROUP, ...TAG_GROUPS];

/** The tags of the categories and of the groups that describe a recipe, in their order. */
export async function loadStoredTags(db: Db): Promise<StoredTag[]> {
  const rows = must(
    await db
      .from("tag")
      .select("id, key, name, group_name")
      .in("group_name", [...SHOWN_GROUPS])
      .order("sort_order")
      .order("name"),
    "load tags",
  );
  return rows.map((row) => ({ id: row.id, key: row.key, name: row.name, group: row.group_name }));
}

/** Which recipe carries which tag, for the tags given. */
export async function loadTagLinks(db: Db, tagIds: readonly string[]): Promise<TagLink[]> {
  if (tagIds.length === 0) return [];
  const rows = await allRows(
    (from, to) =>
      db
        .from("recipe_tag")
        .select("recipe_id, tag_id")
        .in("tag_id", [...tagIds])
        .order("recipe_id")
        .order("tag_id")
        .range(from, to),
    "load recipe tags",
  );
  return rows.map((row) => ({ recipeId: row.recipe_id, tagId: row.tag_id }));
}

/** The tags and their links, for a rule that needs to know both. */
async function loadTagsWithLinks(db: Db): Promise<{ tags: StoredTag[]; links: TagLink[] }> {
  const tags = await loadStoredTags(db);
  return {
    tags,
    links: await loadTagLinks(
      db,
      tags.map((tag) => tag.id),
    ),
  };
}

const GONE: Outcome<never> = { ok: false, error: "Dieses Stichwort gibt es nicht mehr." };

export async function renameTag(db: Db, id: string, name: string): Promise<Outcome> {
  const tags = await loadStoredTags(db);
  const tag = tags.find((entry) => entry.id === id);
  if (!tag) return GONE;
  const checked = checkRename(tag, name, tags);
  if (!checked.ok) return checked;
  const updated = await db.from("tag").update({ name: checked.value }).eq("id", id);
  if (updated.error) throw new Error(`rename tag: ${updated.error.message}`);
  return { ok: true, value: undefined };
}

/**
 * Merges one tag into another: every recipe with the first gets the second, and the first
 * goes. The links come first, so a failure halfway loses no recipe's tag.
 */
export async function mergeTags(
  db: Db,
  householdId: string,
  fromId: string,
  intoId: string,
): Promise<Outcome> {
  const { tags, links } = await loadTagsWithLinks(db);
  const from = tags.find((entry) => entry.id === fromId);
  const into = tags.find((entry) => entry.id === intoId);
  if (!from || !into) return GONE;
  const plan = planMerge(from, into, tags, links);
  if (!plan.ok) return plan;
  await link(db, householdId, plan.value, intoId);
  const removed = await db.from("tag").delete().eq("id", fromId);
  if (removed.error) throw new Error(`remove merged tag: ${removed.error.message}`);
  return { ok: true, value: undefined };
}

export async function moveTag(db: Db, id: string, group: string): Promise<Outcome> {
  const { tags, links } = await loadTagsWithLinks(db);
  const tag = tags.find((entry) => entry.id === id);
  if (!tag) return GONE;
  const checked = checkMove(tag, group, tags, links);
  if (!checked.ok) return checked;
  const updated = await db.from("tag").update({ group_name: checked.value }).eq("id", id);
  if (updated.error) throw new Error(`move tag: ${updated.error.message}`);
  return { ok: true, value: undefined };
}

/** Deletes a tag of the household's own. Its recipes lose it with it (`on delete cascade`). */
export async function deleteTag(db: Db, id: string): Promise<Outcome> {
  const tag = (await loadStoredTags(db)).find((entry) => entry.id === id);
  if (!tag) return GONE;
  const checked = checkDelete(tag);
  if (!checked.ok) return checked;
  const removed = await db.from("tag").delete().eq("id", id);
  if (removed.error) throw new Error(`delete tag: ${removed.error.message}`);
  return { ok: true, value: undefined };
}

/** Links recipes to a tag; a recipe that has it already keeps it once. */
async function link(
  db: Db,
  householdId: string,
  recipeIds: readonly string[],
  tagId: string,
): Promise<void> {
  if (recipeIds.length === 0) return;
  const linked = await db.from("recipe_tag").upsert(
    recipeIds.map((recipe_id) => ({ household_id: householdId, recipe_id, tag_id: tagId })),
    { onConflict: "recipe_id,tag_id", ignoreDuplicates: true },
  );
  if (linked.error) throw new Error(`add tag: ${linked.error.message}`);
}

/**
 * The tag a name the household typed means: one there is, however it is written or with a
 * letter wrong ("Oma Rezept" for "Omas Rezept"), or a new one of its own group. Null for a
 * name that is a category or a diet: no tag to put on a recipe this way.
 */
export async function tagForName(
  db: Db,
  householdId: string,
  typed: string,
): Promise<StoredTag | null> {
  const name = cleanTagName(typed);
  if (name === "") return null;
  const rows = must(await db.from("tag").select("id, key, name, group_name"), "load tags");
  const all = rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    group: row.group_name,
  }));
  const existing = similarTag(name, all);
  if (existing) {
    return (TAG_GROUPS as readonly string[]).includes(existing.group) ? existing : null;
  }
  const created = must(
    await db
      .from("tag")
      .insert({ household_id: householdId, name, group_name: OWN_GROUP })
      .select("id")
      .single(),
    "create tag",
  );
  return { id: created.id, key: null, name, group: OWN_GROUP };
}

/**
 * Gives recipes a tag. In a group that allows one tag per recipe, it replaces the one they
 * had: a recipe made quick is no longer one that takes time.
 */
export async function addTagToRecipes(
  db: Db,
  householdId: string,
  recipeIds: readonly string[],
  tag: StoredTag,
): Promise<void> {
  if (recipeIds.length === 0) return;
  if (SINGLE_GROUPS.has(tag.group)) {
    const rivals = (await loadStoredTags(db))
      .filter((other) => other.group === tag.group && other.id !== tag.id)
      .map((other) => other.id);
    if (rivals.length > 0) {
      const removed = await db
        .from("recipe_tag")
        .delete()
        .in("recipe_id", [...recipeIds])
        .in("tag_id", rivals);
      if (removed.error) throw new Error(`replace tag: ${removed.error.message}`);
    }
  }
  await link(db, householdId, recipeIds, tag.id);
}

export async function removeTagFromRecipes(
  db: Db,
  recipeIds: readonly string[],
  tagId: string,
): Promise<void> {
  if (recipeIds.length === 0) return;
  const removed = await db
    .from("recipe_tag")
    .delete()
    .in("recipe_id", [...recipeIds])
    .eq("tag_id", tagId);
  if (removed.error) throw new Error(`remove tag: ${removed.error.message}`);
}
