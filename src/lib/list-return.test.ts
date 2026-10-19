import { describe, expect, it } from "vitest";
import { cameBack, canStepBack, readLeftList } from "./list-return";

const left = {
  path: "/rezepte?kategorie=hauptgericht",
  historyLength: 4,
  scrollY: 1200,
  shelves: [0, 380],
};

describe("back from a recipe to its list", () => {
  it("steps back to the list the recipe was opened from, filter and all", () => {
    expect(canStepBack(left, "/rezepte", 5)).toBe(true);
  });

  it("opens the list afresh after something else was opened in between", () => {
    expect(canStepBack(left, "/rezepte", 6)).toBe(false);
    expect(canStepBack(left, "/rezepte", 4)).toBe(false);
  });

  it("opens the list afresh when the link names another one", () => {
    expect(canStepBack(left, "/favoriten", 5)).toBe(false);
    expect(canStepBack(null, "/rezepte", 5)).toBe(false);
  });

  it("reads back only what a list stored", () => {
    expect(readLeftList(JSON.stringify(left))).toEqual(left);
    expect(readLeftList(null)).toBeNull();
    expect(readLeftList("{")).toBeNull();
    expect(readLeftList(JSON.stringify({ ...left, path: "https://example.com" }))).toBeNull();
    expect(readLeftList(JSON.stringify({ ...left, shelves: [1, "x"] }))?.shelves).toEqual([1]);
  });

  it("puts the list back only when the history stepped back to it", () => {
    expect(cameBack(left, "/rezepte?kategorie=hauptgericht", 5)).toBe(true);
    expect(cameBack(left, "/rezepte?kategorie=hauptgericht", 6)).toBe(false);
    expect(cameBack(left, "/rezepte", 5)).toBe(false);
  });
});
