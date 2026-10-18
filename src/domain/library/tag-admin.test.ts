import { describe, expect, it } from "vitest";
import {
  checkDelete,
  checkMove,
  checkRename,
  cleanTagName,
  editDistance,
  planMerge,
  similarTag,
  suggestTags,
  tagCounts,
  type StoredTag,
  type TagLink,
} from "./tag-admin";

const tag = (id: string, name: string, group: string, key: string | null = null): StoredTag => ({
  id,
  key,
  name,
  group,
});

const quick = tag("t-quick", "Schnell", "Aufwand", "schnell");
const slow = tag("t-slow", "Braucht Zeit", "Aufwand", "aufwendig");
const italian = tag("t-it", "Italienisch", "Küche", "italienisch");
const mediterranean = tag("t-med", "Mediterran", "Küche", "mediterran");
const main = tag("t-main", "Hauptgericht", "Kategorie", "hauptgericht");
const granny = tag("t-granny", "Omas Rezept", "Eigene");
const granny2 = tag("t-granny2", "Oma Rezept", "Eigene");
const greek = tag("t-greek", "Griechisch", "Eigene");
const tags = [quick, slow, italian, mediterranean, main, granny, granny2, greek];

const link = (recipeId: string, tagId: string): TagLink => ({ recipeId, tagId });

describe("similarTag", () => {
  it("finds a tag however its name is written", () => {
    expect(similarTag("omas rezept", tags)).toBe(granny);
    expect(similarTag("  Omas-Rezept! ", tags)).toBe(granny);
    expect(similarTag("italienisch", tags)).toBe(italian);
  });

  it("finds a tag a letter away, but not from a short name", () => {
    expect(similarTag("Omas Rezpt", [granny])).toBe(granny);
    expect(similarTag("Oma Rezept", [granny])).toBe(granny);
    expect(similarTag("Italienische", tags)).toBe(italian);
    expect(similarTag("Eis", [tag("t-reis", "Reis", "Eigene")])).toBeNull();
  });

  it("finds nothing for a new name", () => {
    expect(similarTag("Kindergeburtstag", tags)).toBeNull();
    expect(similarTag("", tags)).toBeNull();
  });
});

describe("suggestTags", () => {
  it("offers what a name starts with first, then any word of it, then what is nearly it", () => {
    expect(suggestTags("oma", tags).map((t) => t.name)).toEqual(["Oma Rezept", "Omas Rezept"]);
    expect(suggestTags("rez", tags).map((t) => t.name)).toEqual(["Oma Rezept", "Omas Rezept"]);
    expect(suggestTags("Itailenisch", tags).map((t) => t.name)).toEqual(["Italienisch"]);
  });

  it("offers nothing for nothing typed", () => {
    expect(suggestTags(" ", tags)).toEqual([]);
  });
});

describe("cleanTagName", () => {
  it("tidies spaces and cuts a long name", () => {
    expect(cleanTagName("  Omas   Rezept ")).toBe("Omas Rezept");
    expect(cleanTagName("x".repeat(40))).toHaveLength(30);
  });
});

describe("editDistance", () => {
  it("counts letters added, left out, swapped and turned round", () => {
    expect(editDistance("omasrezept", "omarezept")).toBe(1);
    expect(editDistance("lasagne", "lasange")).toBe(1);
    expect(editDistance("reis", "eis")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("checkRename", () => {
  it("renames any tag, a category and one of the app's too", () => {
    expect(checkRename(granny, " Von Oma ", tags)).toEqual({ ok: true, value: "Von Oma" });
    expect(checkRename(main, "Hauptspeise", tags)).toEqual({ ok: true, value: "Hauptspeise" });
    expect(checkRename(quick, "Fix gemacht", tags)).toEqual({ ok: true, value: "Fix gemacht" });
  });

  it("keeps a tag's own name in another spelling", () => {
    expect(checkRename(granny, "omas rezept", tags)).toEqual({ ok: true, value: "omas rezept" });
  });

  it("refuses an empty name and one another tag has", () => {
    expect(checkRename(granny, "  ", tags).ok).toBe(false);
    expect(checkRename(granny2, "Omas Rezept", tags)).toEqual({
      ok: false,
      error: "„Omas Rezept“ gibt es schon. Führe die beiden zusammen.",
    });
    expect(checkRename(quick, "braucht zeit", tags)).toEqual({
      ok: false,
      error: "„Braucht Zeit“ gibt es schon.",
    });
  });
});

describe("planMerge", () => {
  const links = [
    link("r1", granny2.id),
    link("r2", granny2.id),
    link("r2", granny.id),
    link("r3", granny.id),
  ];

  it("gives every recipe of the merged tag the other one, once", () => {
    expect(planMerge(granny2, granny, tags, links)).toEqual({ ok: true, value: ["r1"] });
  });

  it("merges an own tag into one of the app's", () => {
    const cuisine = [link("r1", greek.id), link("r2", greek.id), link("r2", mediterranean.id)];
    expect(planMerge(greek, mediterranean, tags, cuisine)).toEqual({ ok: true, value: ["r1"] });
  });

  it("never lets one of the app's tags go", () => {
    const result = planMerge(quick, granny, tags, links);
    expect(result.ok).toBe(false);
    expect(planMerge(main, granny, tags, links).ok).toBe(false);
  });

  it("refuses a category as the target and a tag merged into itself", () => {
    expect(planMerge(granny, main, tags, links).ok).toBe(false);
    expect(planMerge(granny, granny, tags, links).ok).toBe(false);
  });

  it("refuses where a recipe would have two tags of a group that allows one", () => {
    const cuisine = [link("r1", greek.id), link("r1", italian.id), link("r2", greek.id)];
    expect(planMerge(greek, mediterranean, tags, cuisine)).toEqual({
      ok: false,
      error: "1 Rezept hätte dann zwei Stichworte unter „Küche“. Dort hat ein Rezept nur eines.",
    });
  });
});

describe("checkMove", () => {
  it("moves an own tag into another group", () => {
    expect(checkMove(greek, "Küche", tags, [link("r1", greek.id)])).toEqual({
      ok: true,
      value: "Küche",
    });
  });

  it("keeps the app's tags and the effort group as they are", () => {
    expect(checkMove(italian, "Eigene", tags, []).ok).toBe(false);
    expect(checkMove(greek, "Aufwand", tags, []).ok).toBe(false);
    expect(checkMove(greek, "Kategorie", tags, []).ok).toBe(false);
  });

  it("refuses where a recipe would then have two cuisines", () => {
    const links = [link("r1", greek.id), link("r1", italian.id), link("r2", greek.id)];
    expect(checkMove(greek, "Küche", tags, links)).toEqual({
      ok: false,
      error: "1 Rezept hätte dann zwei Stichworte unter „Küche“. Dort hat ein Rezept nur eines.",
    });
  });
});

describe("checkDelete", () => {
  it("deletes only the household's own tags", () => {
    expect(checkDelete(granny).ok).toBe(true);
    expect(checkDelete(quick).ok).toBe(false);
    expect(checkDelete(main).ok).toBe(false);
  });
});

describe("tagCounts", () => {
  it("counts the recipes of each tag", () => {
    const counts = tagCounts([link("r1", "a"), link("r2", "a"), link("r1", "b")]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
  });
});
