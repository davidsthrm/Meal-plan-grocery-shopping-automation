import { describe, expect, it } from "vitest";
import type { Shop } from "../catalog";
import { buildShoppingList } from "./build";
import { presentByAisle } from "./present";
import {
  favouriteSupermarkets,
  kindsText,
  marketsOfNote,
  namesText,
  offeredSupermarkets,
  readShopDetails,
  sectionsByShop,
  supermarketForKind,
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

  it("buys a kind of grocery at the supermarket the household buys it at", () => {
    const rewe = { ...REWE, aisleGroupIds: ["molkerei"] };
    expect(sections({}, [ALDI, rewe])).toEqual([
      ["Aldi", ["2x Karotten"]],
      ["Rewe", ["Milch", "200 ml Sahne"]],
    ]);
  });

  it("keeps a kind at the main supermarket when the main one names it too", () => {
    const aldi = { ...ALDI, aisleGroupIds: ["molkerei"] };
    const rewe = { ...REWE, aisleGroupIds: ["molkerei", "obst"] };
    expect(sections({}, [aldi, rewe])).toEqual([
      ["Aldi", ["Milch", "200 ml Sahne"]],
      ["Rewe", ["2x Karotten"]],
    ]);
  });

  it("lets a line chosen for another supermarket win over its kind", () => {
    const rewe = { ...REWE, aisleGroupIds: ["molkerei"] };
    expect(sections({ "sahne@main": { shopId: "aldi" } }, [ALDI, rewe])).toEqual([
      ["Aldi", ["2x Karotten", "200 ml Sahne"]],
      ["Rewe", ["Milch"]],
    ]);
  });

  it("does not follow the kinds of a supermarket that is no favourite", () => {
    const ec = { ...shop("ec", null), aisleGroupIds: ["molkerei"] };
    expect(
      sections(
        {},
        [ALDI, REWE, ec].filter((each) => each.supermarketRank),
      ),
    ).toEqual([["Aldi", ["2x Karotten", "Milch", "200 ml Sahne"]]]);
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

describe("the title of a supermarket note", () => {
  const view = (states: Record<string, LineState>) => presentByAisle(lines, states, testIndex);
  const title = (states: Record<string, LineState>, favourites: Shop[]) =>
    namesText(marketsOfNote(view(states), favourites).map((shop) => shop.name));

  it("names every supermarket with a section on the note, the main one first", () => {
    expect(title({}, [ALDI, REWE, LIDL])).toBe("Aldi");
    expect(title({ "sahne@main": { shopId: "rewe" } }, [ALDI, REWE, LIDL])).toBe("Aldi & Rewe");
    expect(
      title({ "sahne@main": { shopId: "rewe" }, "milch@main": { shopId: "lidl" } }, [
        ALDI,
        REWE,
        LIDL,
      ]),
    ).toBe("Aldi, Rewe & Lidl");
  });

  it("names the main supermarket on an empty note, and none while there is none", () => {
    expect(marketsOfNote({ groups: [], atHome: [], notBought: [] }, [ALDI, REWE])).toEqual([ALDI]);
    expect(marketsOfNote(view({}), [])).toEqual([]);
  });

  it("joins names as one says them", () => {
    expect(namesText([])).toBe("");
    expect(namesText(["Aldi"])).toBe("Aldi");
    expect(namesText(["Aldi", "Rewe", "Botzenhardt"])).toBe("Aldi, Rewe & Botzenhardt");
  });
});

describe("offeredSupermarkets", () => {
  const market = (name: string, logo = true): Shop => ({
    ...shop(name.toLowerCase().replace(/\W+/g, "-"), null),
    name,
    logoUrl: logo ? `https://commons.wikimedia.org/wiki/Special:FilePath/${name}.svg` : null,
  });
  const names = (shops: readonly Shop[]) => shops.map((each) => each.name);
  const found = [
    market("Hofladen Maier", false),
    market("Netto Marken-Discount"),
    market("tegut"),
    market("Biomarkt Laupheim", false),
    market("Aldi Süd"),
    market("EDEKA Riedmüller"),
    market("Alnatura"),
    market("Lidl"),
  ];

  it("offers the best-known chains first, the biggest first, then other chains, then the rest", () => {
    const { shown, more } = offeredSupermarkets(found, []);
    expect(names(shown)).toEqual([
      "EDEKA Riedmüller",
      "Lidl",
      "Aldi Süd",
      "Netto Marken-Discount",
      "tegut",
    ]);
    expect(names(more)).toEqual(["Alnatura", "Biomarkt Laupheim", "Hofladen Maier"]);
  });

  it("puts the household's own markets first, the main one first", () => {
    const chosen = [found[0], found[3]];
    const { shown } = offeredSupermarkets(found, chosen);
    expect(names(shown)).toEqual([
      "Hofladen Maier",
      "Biomarkt Laupheim",
      "EDEKA Riedmüller",
      "Lidl",
      "Aldi Süd",
    ]);
  });

  it("shows every chosen market, however many", () => {
    const { shown, more } = offeredSupermarkets(found, found.slice(0, 6));
    expect(shown).toHaveLength(6);
    expect(more).toHaveLength(2);
  });
});

describe("what the household says about a market", () => {
  const kinds = [
    { id: "eier", name: "Eier", sortOrder: 100 },
    { id: "obst", name: "Obst & Gemüse", sortOrder: 10 },
    { id: "fleisch", name: "Fleisch & Wurst", sortOrder: 80 },
  ];

  it("reads the street without stray spaces, and none for an empty field", () => {
    expect(
      readShopDetails({ address: "  Biberacher   Straße 12 ", kinds: [] }, kinds).address,
    ).toBe("Biberacher Straße 12");
    expect(readShopDetails({ address: "  ", kinds: [] }, kinds).address).toBeNull();
  });

  it("keeps only the household's kinds of grocery, in the order of a walk through a shop", () => {
    expect(
      readShopDetails({ address: "", kinds: ["eier", "erfunden", "obst"] }, kinds).aisleGroupIds,
    ).toEqual(["obst", "eier"]);
  });

  it("keeps where a street picked from the suggestions lies", () => {
    const picked = {
      address: "Biberacher Straße 12",
      kinds: [],
      lat: "48.22",
      lon: "9.88",
      picked: "Biberacher Straße 12",
    };
    expect(readShopDetails(picked, kinds).position).toEqual({ lat: 48.22, lon: 9.88 });
    // Changed by hand after picking, the place is no longer the street's.
    expect(readShopDetails({ ...picked, address: "Ulmer Straße 3" }, kinds).position).toBeNull();
    expect(readShopDetails({ ...picked, lat: "", lon: "" }, kinds).position).toBeNull();
    expect(readShopDetails({ ...picked, lat: "123" }, kinds).position).toBeNull();
    expect(readShopDetails({ address: "Biberacher Straße 12", kinds: [] }, kinds).position).toBe(
      null,
    );
  });

  it("names the kinds bought there, and nothing for a kind deleted since", () => {
    expect(kindsText({ aisleGroupIds: ["eier", "geloescht", "obst"] }, kinds)).toBe(
      "Obst & Gemüse · Eier",
    );
    expect(kindsText({}, kinds)).toBe("");
  });
});

describe("supermarketForKind", () => {
  const aldi = { id: "aldi", aisleGroupIds: ["tk"] };
  const rewe = { id: "rewe", aisleGroupIds: ["obst", "tk"] };

  it("is the first supermarket that buys the kind, the main one first", () => {
    expect(supermarketForKind("tk", [aldi, rewe])).toBe("aldi");
    expect(supermarketForKind("obst", [aldi, rewe])).toBe("rewe");
  });

  it("is the main one for a kind no supermarket names, or without a kind", () => {
    expect(supermarketForKind("brot", [aldi, rewe])).toBe("aldi");
    expect(supermarketForKind(null, [rewe, aldi])).toBe("rewe");
  });

  it("is null while the household has no supermarket", () => {
    expect(supermarketForKind("tk", [])).toBeNull();
  });
});
