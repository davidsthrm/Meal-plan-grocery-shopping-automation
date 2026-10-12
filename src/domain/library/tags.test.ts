import { describe, expect, it } from "vitest";
import { effortOf, groupTags, toggleTag, type Tag } from "./tags";

const tag = (ref: string, group: string): Tag => ({ ref, name: ref, group });
const all = [
  tag("schnell", "Aufwand"),
  tag("aufwendig", "Aufwand"),
  tag("pasta", "Gericht"),
  tag("ofen", "Gericht"),
  tag("hauptgericht", "Kategorie"),
  tag("omas", "Eigene"),
];

describe("effortOf", () => {
  it("goes by the tag first", () => {
    expect(effortOf({ tags: ["aufwendig"], prepMinutes: 20 })).toBe("aufwendig");
    expect(effortOf({ tags: ["pasta", "schnell"], prepMinutes: null })).toBe("schnell");
  });

  it("goes by the printed time without a tag", () => {
    expect(effortOf({ tags: [], prepMinutes: 30 })).toBe("schnell");
    expect(effortOf({ tags: [], prepMinutes: 45 })).toBe("alltag");
    expect(effortOf({ tags: [], prepMinutes: 90 })).toBe("aufwendig");
  });

  it("does not guess for a recipe with neither", () => {
    expect(effortOf({ tags: ["pasta"], prepMinutes: null })).toBeNull();
  });
});

describe("groupTags", () => {
  it("sorts tags into the groups a recipe is described by, in their order", () => {
    expect(groupTags(all).map((group) => [group.name, group.tags.map((t) => t.ref)])).toEqual([
      ["Aufwand", ["schnell", "aufwendig"]],
      ["Gericht", ["pasta", "ofen"]],
      ["Eigene", ["omas"]],
    ]);
  });
});

describe("toggleTag", () => {
  it("switches a tag on and off", () => {
    expect(toggleTag(["pasta"], all[3], all)).toEqual(["pasta", "ofen"]);
    expect(toggleTag(["pasta", "ofen"], all[2], all)).toEqual(["ofen"]);
  });

  it("replaces the other tag of a group that allows one", () => {
    expect(toggleTag(["schnell", "pasta"], all[1], all)).toEqual(["pasta", "aufwendig"]);
  });
});
