import { describe, expect, it } from "vitest";
import type { Shop } from "../catalog";
import { buildShoppingList } from "./build";
import { presentByAisle } from "./present";
import {
  favouriteSupermarkets,
  sectionsByShop,
  withAdded,
  withMain,
  without,
} from "./supermarkets";
import { line, testIndex } from "./test-catalog";
import { singleTrip } from "./trips";
import type { LineState } from "./types";

const shop = (id: string, rank: number | null, kind: Shop["kind"] = "supermarket"): Shop => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  shortLabel: id,
  sortOrder: 0,
  aisleSortOverrides: {},
  kind,
  supermarketRank: rank,
});

const ALDI = shop("aldi", 1);
const REWE = shop("rewe", 2);
const LIDL = shop("lidl", 3);

const lines = buildShoppingList({
  index: testIndex,
  trips: singleTrip("2026-10-12"),
  onDemand: [],
  recipes: [
    {
      id: "r",
      title: "Eintopf",
      kind: "cookbook",
      servings: { min: 4, max: 4, unit: null },
      ingredients: [line("karotten", 2, "Stück"), line("sahne", 200, "ml")],
    },
  ],
  slots: [
    {
      id: "s",
      date: "2026-10-13",
      meal: "lunch",
      kind: "recipes",
      items: [{ recipeId: "r", servings: 4 }],
    },
  ],
  manualEntries: [{ id: "m1", text: "Milch" }],
});

const sections = (states: Record<string, LineState>, favourites: Shop[]) =>
  sectionsByShop(presentByAisle(lines, states, testIndex), favourites).map((section) => [
    section.shop?.name ?? null,
    section.groups.flatMap((group) => group.lines.map((view) => view.text)),
  ]);

describe("favouriteSupermarkets", () => {
  it("lists the household's supermarkets, the main one first", () => {
    const shops = [shop("metzger", null, "butcher"), LIDL, shop("ec", null), REWE, ALDI];
    expect(favouriteSupermarkets(shops).map((each) => each.id)).toEqual(["aldi", "rewe", "lidl"]);
  });

  it("is empty until the household has named one", () => {
    expect(favouriteSupermarkets([shop("aldi", null), shop("ec", null)])).toEqual([]);
  });
});

describe("sectionsByShop", () => {
  it("puts everything under the main supermarket", () => {
    expect(sections({}, [ALDI, REWE])).toEqual([
      ["Aldi", ["2x Karotten", "Milch", "200 ml Sahne"]],
    ]);
  });

  it("gives a supermarket a section of its own for what is moved there", () => {
    expect(sections({ "sahne@main": { shopId: "rewe" } }, [ALDI, REWE, LIDL])).toEqual([
      ["Aldi", ["2x Karotten", "Milch"]],
      ["Rewe", ["200 ml Sahne"]],
    ]);
  });

  it("does not follow where the catalog buys a thing, only the household's choice", () => {
    // The catalog buys milk at E-Center: on the note it is bought at the main supermarket.
    expect(sections({}, [ALDI, shop("ec", 2)])).toEqual([
      ["Aldi", ["2x Karotten", "Milch", "200 ml Sahne"]],
    ]);
  });

  it("leaves out the main supermarket when everything went elsewhere", () => {
    const all = { "karotten@main": { shopId: "rewe" }, "sahne@main": { shopId: "rewe" } };
    expect(sections({ ...all, "milch@main": { shopId: "rewe" } }, [ALDI, REWE])).toEqual([
      ["Rewe", ["2x Karotten", "Milch", "200 ml Sahne"]],
    ]);
  });

  it("puts a line back under the main one when its supermarket is no favourite any more", () => {
    expect(sections({ "sahne@main": { shopId: "rewe" } }, [ALDI])).toEqual([
      ["Aldi", ["2x Karotten", "Milch", "200 ml Sahne"]],
    ]);
  });

  it("is one section without a name while the household has named no supermarket", () => {
    expect(sections({ "sahne@main": { shopId: "rewe" } }, [])).toEqual([
      [null, ["2x Karotten", "Milch", "200 ml Sahne"]],
    ]);
  });
});

describe("the order of the supermarkets", () => {
  it("makes one the main one and keeps the others in their order", () => {
    expect(withMain(["aldi", "rewe", "lidl"], "lidl")).toEqual(["lidl", "aldi", "rewe"]);
  });

  it("adds a supermarket at the end, once", () => {
    expect(withAdded(["aldi"], "rewe")).toEqual(["aldi", "rewe"]);
    expect(withAdded(["aldi", "rewe"], "aldi")).toEqual(["aldi", "rewe"]);
    // The first one named is the main one.
    expect(withAdded([], "rewe")).toEqual(["rewe"]);
  });

  it("removes one, and the next becomes the main one", () => {
    expect(without(["aldi", "rewe", "lidl"], "aldi")).toEqual(["rewe", "lidl"]);
  });
});
