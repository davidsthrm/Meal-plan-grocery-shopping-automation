import { describe, expect, it } from "vitest";
import type { PlanSlot } from "../plan";
import type { Ingredient } from "../catalog";
import type { Recipe, RecipeIngredient, Servings } from "../recipe";
import { buildShoppingList, moveKey, originsOf, partKey, toDefaultUnit } from "./build";
import { createCatalogIndex } from "../catalog";
import { line, testCatalog, testIndex } from "./test-catalog";
import {
  butcherWeekdays,
  DEFAULT_SHOPPING_DAYS,
  noteId,
  singleTrip,
  tripsBetween,
  type ShoppingTrip,
} from "./trips";
import type { ManualEntry, ShoppingLine } from "./types";

const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const SUNDAY = "2026-10-18";

function recipe(
  id: string,
  ingredients: RecipeIngredient[],
  servings: Servings = { min: 4, max: 4, unit: null },
): Recipe {
  return { id, title: id, kind: "cookbook", servings, ingredients };
}

/** A dinner: bought on its own day's errand, which a lunch on a working day is not. */
function slot(date: string, recipeId: string, servings = 4): PlanSlot {
  return {
    id: `${date}-${recipeId}`,
    date,
    meal: "dinner",
    kind: "recipes",
    items: [{ recipeId, servings }],
  };
}

function build(recipes: Recipe[], slots: PlanSlot[], manualEntries: ManualEntry[] = []) {
  const lines = buildShoppingList({
    index: testIndex,
    recipes,
    slots,
    // One shopping day and one list for it, as on the handwritten note.
    trips: singleTrip(MONDAY),
    onDemand: [],
    manualEntries,
  });
  return new Map<string, ShoppingLine>(lines.map((l) => [l.key, l]));
}

describe("toDefaultUnit", () => {
  const prawns = testIndex.ingredientById.get("garnelen")!;
  const carrots = testIndex.ingredientById.get("karotten")!;

  it("reads packs of a pack ingredient as packs, and a bare count typed on a note too", () => {
    expect(toDefaultUnit(prawns, { quantity: 2, unit: "Packung" })).toBe(450);
    expect(toDefaultUnit(prawns, { quantity: 2, unit: "Stück" }, true)).toBe(450);
    expect(toDefaultUnit(prawns, { quantity: 300, unit: "g" })).toBe(300);
  });

  it("does not read the pieces a recipe counts as packs", () => {
    // "4 Riesengarnelen" are four prawns, not 900 g.
    expect(toDefaultUnit(prawns, { quantity: 4, unit: "Stück" })).toBeNull();
  });

  it("returns null when there is no conversion path", () => {
    expect(toDefaultUnit(carrots, { quantity: 1, unit: "Bund" })).toBeNull();
    expect(toDefaultUnit(carrots, { quantity: 300, unit: "g" })).toBe(3);
  });
});

describe("partKey", () => {
  it("takes the dimension off a line's key, umlauts and all", () => {
    expect(partKey("ingwer@main#Stück")).toBe("ingwer@main");
    expect(partKey("basilikum@later#Stängel")).toBe("basilikum@later");
    expect(partKey("butter@main#mass")).toBe("butter@main");
    expect(partKey("brot@main@baecker")).toBe("brot@main@baecker");
  });
});

describe("buildShoppingList", () => {
  it("lists the prawns a recipe counts as pieces, beside what it weighs", () => {
    const lines = build(
      [
        recipe("garnelen-pfanne", [line("garnelen", 4, "Stück")]),
        recipe("paella", [line("garnelen", 200, "g")]),
      ],
      [slot(MONDAY, "garnelen-pfanne"), slot(MONDAY, "paella")],
    );
    const prawns = [...lines.values()].filter((entry) => entry.ingredientId === "garnelen");
    expect(prawns.map((entry) => entry.purchase)).toEqual([
      { quantity: 200, unit: "g" },
      { quantity: 4, unit: "Stück" },
    ]);
    expect(prawns.map((entry) => entry.amounts)).toEqual([
      [{ quantity: 200, unit: "g" }],
      [{ quantity: 4, unit: "Stück" }],
    ]);
  });

  it("sums one ingredient across meals and rounds up to whole pieces", () => {
    const lines = build(
      [
        recipe("eintopf", [line("karotten", 2, "Stück")]),
        recipe("salat", [line("karotten", 250, "g")]),
      ],
      [slot(MONDAY, "eintopf"), slot(TUESDAY, "salat")],
    );
    const carrots = lines.get("karotten@main")!;
    expect(carrots.amounts).toEqual([{ quantity: 4.5, unit: "Stück" }]);
    expect(carrots.purchase).toEqual({ quantity: 5, unit: "Stück" });
    expect(carrots.contributions).toHaveLength(2);
    expect(lines.size).toBe(1);
  });

  it("scales by the slot's servings", () => {
    const forTwo = recipe("pasta", [line("karotten", 1, "Stück")], { min: 2, max: 2, unit: null });
    expect(build([forTwo], [slot(MONDAY, "pasta", 4)]).get("karotten@main")!.purchase).toEqual({
      quantity: 2,
      unit: "Stück",
    });
  });

  it("cooks a recipe as written when the servings are inside its range", () => {
    const stew = recipe("eintopf", [line("karotten", 2, "Stück")], { min: 4, max: 6, unit: null });
    expect(
      build([stew], [slot(MONDAY, "eintopf", 4)]).get("karotten@main")!.purchase?.quantity,
    ).toBe(2);
    expect(
      build([stew], [slot(MONDAY, "eintopf", 6)]).get("karotten@main")!.purchase?.quantity,
    ).toBe(2);
  });

  it("merges units that convert and shows the amount needed, with the packs said apart", () => {
    const sauce = recipe("sauce", [line("sahne", 150, "ml"), line("sahne", 2, "EL")]);
    const one = build([sauce], [slot(MONDAY, "sauce")]).get("sahne@main")!;
    expect(one.amounts).toEqual([{ quantity: 180, unit: "ml" }]);
    expect(one.purchase).toEqual({ quantity: 180, unit: "ml" });
    expect(one.packs).toBe(1);

    const two = build([sauce], [slot(MONDAY, "sauce", 8)]).get("sahne@main")!;
    expect(two.amounts).toEqual([{ quantity: 360, unit: "ml" }]);
    expect(two.purchase).toEqual({ quantity: 360, unit: "ml" });
    expect(two.packs).toBe(2);
  });

  it("shows one pack by its amount as much as several: never the name alone", () => {
    // Before, one pack showed the name only and two "2x": the list mixed both.
    const one = build([recipe("a", [line("kleine-tomaten", 200, "g")])], [slot(MONDAY, "a")]);
    expect(one.get("kleine-tomaten@main")!.purchase).toEqual({ quantity: 200, unit: "g" });
    const four = build([recipe("a", [line("kleine-tomaten", 900, "g")])], [slot(MONDAY, "a")]);
    expect(four.get("kleine-tomaten@main")).toMatchObject({
      purchase: { quantity: 900, unit: "g" },
      packs: 4,
    });
  });

  it("rounds what is not bought by count or weight only as far as it reads well", () => {
    const lines = build([recipe("a", [line("ingwer", 13.4, "g")])], [slot(MONDAY, "a", 6)]);
    // 13,4 g for four persons is 20,1 g for six.
    expect(lines.get("ingwer@main")!.purchase).toEqual({ quantity: 25, unit: "g" });
  });

  it("names a staple by the spoonful without an amount, and buys anything else", () => {
    const lines = build(
      [recipe("a", [line("sahne", 2, "EL")]), recipe("b", [line("sahne", 100, "ml")])],
      [slot(MONDAY, "a"), slot(TUESDAY, "b")],
    );
    // A spoonful next to a real amount is added to it.
    expect(lines.get("sahne@main")!.purchase).toEqual({ quantity: 130, unit: "ml" });
    // Six tablespoons of Schmand are bought: the amount stands in front.
    const spoons = build([recipe("a", [line("sahne", 6, "EL")])], [slot(MONDAY, "a")]);
    expect(spoons.get("sahne@main")).toMatchObject({
      purchase: { quantity: 90, unit: "ml" },
      amounts: [{ quantity: 90, unit: "ml" }],
    });
    // Three tablespoons of oil, which is at home anyway, are "Öl".
    const staple = createCatalogIndex({
      ...testCatalog,
      ingredients: testCatalog.ingredients.map((each) =>
        each.id === "sahne" ? { ...each, isPantryStaple: true } : each,
      ),
    });
    const oil = buildShoppingList({
      index: staple,
      recipes: [recipe("a", [line("sahne", 3, "EL")])],
      slots: [slot(MONDAY, "a")],
      trips: singleTrip(MONDAY),
      onDemand: [],
      manualEntries: [],
    }).find((each) => each.key === "sahne@main");
    expect(oil).toMatchObject({ purchase: null, amounts: [{ quantity: 45, unit: "ml" }] });
  });

  it("keeps amounts apart that cannot be converted instead of guessing", () => {
    const lines = build(
      [recipe("a", [line("karotten", 2, "Stück"), line("karotten", 1, "Bund")])],
      [slot(MONDAY, "a")],
    );
    expect(lines.get("karotten@main")!.purchase).toEqual({ quantity: 2, unit: "Stück" });
    expect(lines.get("karotten@main#Bund")!.purchase).toEqual({ quantity: 1, unit: "Bund" });
  });

  it("does not make a line of its own out of a spoonful that cannot be added", () => {
    // Butter is bought by weight; a tablespoon of it has no weight the catalog knows.
    const lines = build(
      [recipe("a", [line("butter", 3, "EL"), line("butter", 2, "TL")])],
      [slot(MONDAY, "a")],
    );
    expect([...lines.keys()]).toEqual(["butter@main"]);
    expect(lines.get("butter@main")).toMatchObject({
      purchase: null,
      amounts: [],
      hasUnquantified: true,
    });
    // Next to a real amount, the spoonful changes nothing about what is bought.
    const more = build(
      [recipe("a", [line("butter", 300, "g"), line("butter", 1, "EL")])],
      [slot(MONDAY, "a")],
    );
    expect([...more.keys()]).toEqual(["butter@main"]);
    expect(more.get("butter@main")!.amounts).toEqual([{ quantity: 300, unit: "g" }]);
  });

  it("names one piece in the singular where the catalog knows the word", () => {
    const one = build([recipe("a", [line("karotten", 1, "Stück")])], [slot(MONDAY, "a")]);
    expect(one.get("karotten@main")).toMatchObject({ label: "Karotte" });
    const two = build([recipe("a", [line("karotten", 2, "Stück")])], [slot(MONDAY, "a")]);
    expect(two.get("karotten@main")).toMatchObject({ label: "Karotten" });
    // No singular among the other names: the name stays as it is.
    const tomato = build([recipe("a", [line("tomaten", 1, "Stück")])], [slot(MONDAY, "a")]);
    expect(tomato.get("tomaten@main")).toMatchObject({ label: "Tomaten" });
  });

  it("shows what an ingredient without a buying unit needs, apart where it cannot be added", () => {
    // Ginger used to be "Ingwer" alone, whatever the recipes asked for.
    const lines = build(
      [
        recipe("a", [
          line("ingwer", 20, "g"),
          line("ingwer", 1, "Stück"),
          line("ingwer", null, null),
        ]),
      ],
      [slot(MONDAY, "a")],
    );
    expect(lines.get("ingwer@main")).toMatchObject({
      purchase: { quantity: 20, unit: "g" },
      hasUnquantified: true,
    });
    expect(lines.get("ingwer@main#Stück")).toMatchObject({
      purchase: { quantity: 1, unit: "Stück" },
    });
  });

  it("names one piece in the singular where the catalog knows the word, at any buying mode", () => {
    // "1 Stück Schalotten" was the line: now "1x Schalotte".
    const shallot = build([recipe("a", [line("schalotten", 1, "Stück")])], [slot(MONDAY, "a")]);
    expect(shallot.get("schalotten@main")).toMatchObject({
      label: "Schalotte",
      purchase: { quantity: 1, unit: "Stück" },
      forms: { one: "Schalotte", many: "Schalotten" },
    });
    const half = build([recipe("a", [line("schalotten", 0.5, "Stück")])], [slot(MONDAY, "a")]);
    expect(half.get("schalotten@main")!.purchase).toEqual({ quantity: 1, unit: "Stück" });
  });

  it("lists an ingredient without any quantity by name", () => {
    const salt = build([recipe("a", [line("salz", null, null)])], [slot(MONDAY, "a")]).get(
      "salz@main",
    )!;
    expect(salt).toMatchObject({ purchase: null, amounts: [], hasUnquantified: true });
  });

  it("leaves alternative ingredients off the list", () => {
    const lines = build(
      [recipe("a", [line("ingwer", 1, "Stück"), line("salz", 1, "TL", { alternativeTo: 0 })])],
      [slot(MONDAY, "a")],
    );
    expect([...lines.keys()]).toEqual(["ingwer@main#Stück"]);
  });

  it("buys the extra portions of a meal cooked for leftovers with it", () => {
    const stew = recipe("eintopf", [line("karotten", 2, "Stück")]);
    const cooked = { ...slot(MONDAY, "eintopf", 4), extra: 2 } as PlanSlot;
    // Two extra portions for four persons: half as much again.
    expect(build([stew], [cooked]).get("karotten@main")!.purchase?.quantity).toBe(3);
  });

  it("does not bake more cakes for leftovers", () => {
    const cake = recipe("kuchen", [line("eier", 4, "Stück")], {
      min: 1,
      max: 1,
      unit: "Springform",
    });
    const baked = { ...slot(MONDAY, "kuchen", 1), extra: 4 } as PlanSlot;
    expect(build([cake], [baked]).get("eier@main")!.amounts).toEqual([
      { quantity: 4, unit: "Stück" },
    ]);
  });

  it("uses the upper bound of a quantity range", () => {
    const lines = build(
      [recipe("a", [line("tomaten", 2, "Stück", { quantityMax: 3 })])],
      [slot(MONDAY, "a")],
    );
    expect(lines.get("tomaten@main")!.purchase?.quantity).toBe(3);
  });

  it("ignores slots without recipes", () => {
    const slots: PlanSlot[] = [
      { id: "1", date: MONDAY, meal: "lunch", kind: "leftovers", ofSlotId: null },
      { id: "2", date: MONDAY, meal: "dinner", kind: "free_text", label: "Vesper" },
      { id: "3", date: TUESDAY, meal: "lunch", kind: "away", label: "Oma Heidrun" },
      { id: "4", date: TUESDAY, meal: "dinner", kind: "skipped" },
    ];
    expect(build([], slots).size).toBe(0);
  });

  it("handles a slot with a main dish and a side", () => {
    const slots: PlanSlot[] = [
      {
        id: "so",
        date: MONDAY,
        meal: "lunch",
        kind: "recipes",
        items: [
          { recipeId: "steak", servings: 4 },
          { recipeId: "spaetzle", servings: 4 },
        ],
      },
    ];
    const lines = build(
      [recipe("steak", [line("sahne", 150, "ml")]), recipe("spaetzle", [line("eier", 5, "Stück")])],
      slots,
    );
    expect([...lines.keys()].sort()).toEqual(["eier@main", "sahne@main"]);
    expect(lines.get("eier@main")!.purchase).toEqual({ quantity: 10, unit: "Stück" });
  });

  it("fails loudly when a slot points at a recipe that does not exist", () => {
    expect(() => build([], [slot(MONDAY, "gone")])).toThrow(/unknown recipe gone/);
  });

  describe("freshness", () => {
    const steakDinner = recipe("steak", [line("steak", 4, "Stück"), line("sahne", 150, "ml")]);

    it("moves what would not keep until the meal to a later trip", () => {
      const lines = build([steakDinner], [slot(SUNDAY, "steak")]);
      expect(lines.get("steak@later")).toMatchObject({ trip: "later", neededBy: SUNDAY });
      expect(lines.get("sahne@main")).toMatchObject({ trip: "main", neededBy: null });
    });

    it("buys it on the shopping day when the meal is soon enough", () => {
      const lines = build([steakDinner], [slot(TUESDAY, "steak")]);
      expect(lines.has("steak@main")).toBe(true);
      expect(lines.has("steak@later")).toBe(false);
    });

    it("splits an ingredient that is needed both early and late in the week", () => {
      const lines = build([steakDinner], [slot(TUESDAY, "steak"), slot(SUNDAY, "steak")]);
      expect(lines.get("steak@main")!.purchase?.quantity).toBe(4);
      expect(lines.get("steak@later")!.purchase?.quantity).toBe(4);
      expect(lines.get("sahne@main")!.amounts).toEqual([{ quantity: 300, unit: "ml" }]);
    });
  });

  describe("at home", () => {
    it("pre-ticks pantry staples", () => {
      const lines = build(
        [recipe("a", [line("salz", null, null), line("ingwer", 1, "Stück")])],
        [slot(MONDAY, "a")],
      );
      expect(lines.get("salz@main")!.defaultAtHome).toBe(true);
      expect(lines.get("ingwer@main#Stück")!.defaultAtHome).toBe(false);
    });

    it("never pre-ticks a staple the household put on the list by hand", () => {
      const lines = build(
        [recipe("a", [line("butter", 50, "g")])],
        [slot(MONDAY, "a")],
        [{ id: "m1", text: "Butter" }],
      );
      expect(lines.get("butter@main")!.defaultAtHome).toBe(false);
    });
  });

  describe("free entries", () => {
    it("adds a known ingredient to its line and keeps the rest as the note", () => {
      const milk = build([], [], [{ id: "m1", text: "Milch WS 1.29" }]).get("milch@main")!;
      expect(milk).toMatchObject({ label: "Milch", shopId: "ec", note: "WS 1.29", purchase: null });
      expect(milk.contributions[0].source).toEqual({ type: "manual", entryId: "m1" });
    });

    it("merges with what recipes need of the same ingredient", () => {
      const lines = build(
        [recipe("a", [line("sahne", 150, "ml")])],
        [slot(MONDAY, "a")],
        [{ id: "m1", text: "2x Sahne" }],
      );
      expect(lines.get("sahne@main")!.amounts).toEqual([{ quantity: 550, unit: "ml" }]);
      expect(lines.get("sahne@main")).toMatchObject({
        purchase: { quantity: 550, unit: "ml" },
        packs: 3,
      });
    });

    it("carries a typed quantity onto the list", () => {
      const lines = build(
        [],
        [],
        [
          { id: "m1", text: "600 g Leberkäse" },
          { id: "m2", text: "2x Garnelen" },
          { id: "m3", text: "20 Eier" },
        ],
      );
      expect(lines.get("leberkaese@main")!.purchase).toEqual({ quantity: 600, unit: "g" });
      // Two packs of 225 g, said as what they weigh.
      expect(lines.get("garnelen@main")).toMatchObject({
        purchase: { quantity: 450, unit: "g" },
        packs: 2,
      });
      expect(lines.get("eier@main")!.purchase).toEqual({ quantity: 20, unit: "Stück" });
    });

    it("keeps text that matches nothing as a free line in the chosen or default shop", () => {
      const lines = build(
        [],
        [],
        [
          { id: "m1", text: "Geschenkpapier" },
          { id: "m2", text: "Blumen", shopId: "ec", aisleGroupId: "obst" },
        ],
      );
      expect(lines.get("manual:m1")).toMatchObject({
        label: "Geschenkpapier",
        ingredientId: null,
        shopId: "aldi",
        aisleGroupId: "sonstiges",
        defaultAtHome: false,
      });
      expect(lines.get("manual:m2")).toMatchObject({ shopId: "ec", aisleGroupId: "obst" });
    });

    it("buys as many of a free line as the number in front says", () => {
      const lines = build([], [], [{ id: "m1", text: "4 Ingwer-Shots" }]);
      expect(lines.get("manual:m1")).toMatchObject({
        label: "Ingwer-Shots",
        purchase: { quantity: 4, unit: "Stück" },
        amounts: [{ quantity: 4, unit: "Stück" }],
        hasUnquantified: false,
      });
    });
  });

  it("lists a recipe line that is not mapped to the catalog by its name, as much as needed", () => {
    const lines = build(
      [recipe("a", [line(null, 1, "Stück", { originalText: "1 Sternfrucht" })])],
      [slot(MONDAY, "a"), slot(TUESDAY, "a")],
    );
    const loose = lines.get("unmapped:sternfrucht")!;
    expect(loose).toMatchObject({
      label: "Sternfrucht",
      ingredientId: null,
      aisleGroupId: "sonstiges",
      purchase: { quantity: 2, unit: "Stück" },
    });
    expect(loose.contributions).toHaveLength(2);
  });

  it("scales a line the catalog does not know yet with the meal", () => {
    // Typed for one person and planned for four: "0,75 Seele" stood on the list for one.
    const seelen = recipe("seelen", [line(null, 0.75, "Stück", { originalText: "0,75 Seele" })], {
      min: 1,
      max: 1,
      unit: null,
    });
    const forFour = build([seelen], [slot(MONDAY, "seelen", 4)]).get("unmapped:seele")!;
    expect(forFour.label).toBe("Seele");
    expect(forFour.purchase).toEqual({ quantity: 3, unit: "Stück" });
    // What is counted is bought whole.
    const forOne = build([seelen], [slot(MONDAY, "seelen", 1)]).get("unmapped:seele")!;
    expect(forOne.purchase).toEqual({ quantity: 1, unit: "Stück" });
    expect(forOne.amounts).toEqual([{ quantity: 0.75, unit: "Stück" }]);
  });

  it("buys a line the catalog does not know by the name it is proposed with", () => {
    const olives = line(null, 6, "Stück", {
      originalText: "6 grüne, paprikagefüllte Oliven (Glas; nach Belieben)",
      proposedName: "Paprikaoliven",
    });
    const lines = build([recipe("salat", [olives])], [slot(MONDAY, "salat")]);
    expect(lines.get("unmapped:paprikaoliven")).toMatchObject({
      label: "Paprikaoliven",
      purchase: { quantity: 6, unit: "Stück" },
    });
  });

  it("lists a line the catalog does not know without an amount by its name alone", () => {
    const lines = build(
      [recipe("a", [line(null, null, null, { originalText: "Sternfrucht, in Scheiben" })])],
      [slot(MONDAY, "a")],
    );
    expect(lines.get("unmapped:sternfrucht")).toMatchObject({
      label: "Sternfrucht",
      purchase: null,
    });
  });

  it("marks a line optional only when every use of it is optional", () => {
    const lines = build(
      [
        recipe("a", [
          line("ingwer", 1, "Stück", { optional: true }),
          line("tomaten", 1, "Stück", { optional: true }),
        ]),
        recipe("b", [line("tomaten", 2, "Stück")]),
      ],
      [slot(MONDAY, "a"), slot(MONDAY, "b")],
    );
    expect(lines.get("ingwer@main#Stück")!.optional).toBe(true);
    expect(lines.get("tomaten@main")!.optional).toBe(false);
  });
});

describe("slices of a lemon", () => {
  it("buy one lemon, not slices of an ingredient of their own", () => {
    const fish = recipe("fisch", [line("zitronen", 2, "Scheibe")]);
    const lemon = build([fish], [slot(MONDAY, "fisch")]).get("zitronen@main")!;
    expect(lemon).toMatchObject({ label: "Zitrone", purchase: { quantity: 1, unit: "Stück" } });
    // Added to what other recipes need, still in whole lemons.
    const tea = recipe("tee", [line("zitronen", 1, "Stück")]);
    const both = build([fish, tea], [slot(MONDAY, "fisch"), slot(MONDAY, "tee")]);
    expect(both.get("zitronen@main")!.purchase).toEqual({ quantity: 2, unit: "Stück" });
  });
});

describe("what a week needs besides its cooked meals", () => {
  const vesper = (foods: { label: string; ingredientId: string | null; shopId: string | null }[]) =>
    ({
      id: "vesper",
      date: TUESDAY,
      meal: "dinner",
      kind: "free_text",
      label: "Vesper",
      foods,
    }) satisfies PlanSlot;
  const bread = { label: "Brot", ingredientId: "brot", shopId: null };

  it("lists the foods of a meal without a recipe, by name and without an amount", () => {
    const lines = build(
      [],
      [vesper([bread, { label: "Gurke", ingredientId: null, shopId: null }])],
    );
    expect(lines.get("brot@main")).toMatchObject({ label: "Brot", purchase: null, amounts: [] });
    expect(lines.get("brot@main")!.contributions[0].source).toMatchObject({
      type: "food",
      mealLabel: "Vesper",
      date: TUESDAY,
    });
    // Not in the catalog: listed as written, where free lines go.
    expect(lines.get("food:gurke@")).toMatchObject({
      label: "Gurke",
      shopId: "aldi",
      aisleGroupId: "sonstiges",
    });
  });

  it("lists what goes with a recipe and has none: the baguette with the soup", () => {
    const soup = recipe("suppe", [line("karotten", 2, "Stück")]);
    const lunch: PlanSlot = {
      id: "suppe",
      date: MONDAY,
      meal: "lunch",
      kind: "recipes",
      items: [{ recipeId: "suppe", servings: 4 }],
      foods: [
        { label: "Brot", ingredientId: "brot", shopId: null },
        { label: "Dinkelbaguette", ingredientId: null, shopId: null },
      ],
    };
    const lines = build([soup], [lunch]);
    expect(lines.get("karotten@main")!.purchase).toMatchObject({ quantity: 2 });
    expect(lines.get("brot@main")).toMatchObject({ label: "Brot", purchase: null });
    // The meal it is for is named by its recipe.
    expect(lines.get("brot@main")!.contributions[0].source).toMatchObject({
      type: "food",
      mealLabel: soup.title,
      date: MONDAY,
    });
    expect(lines.get("food:dinkelbaguette@")).toMatchObject({ label: "Dinkelbaguette" });
    // One said, one bought.
    const counted: PlanSlot = {
      ...lunch,
      foods: [{ label: "Dinkelbaguette", quantity: 1, ingredientId: null, shopId: null }],
    };
    expect(build([soup], [counted]).get("food:dinkelbaguette@")!.purchase).toEqual({
      quantity: 1,
      unit: "Stück",
    });
  });

  it("counts a food named as one piece: Karotte is one of the Karotten", () => {
    const carrot = { label: "Karotte", ingredientId: "karotten", shopId: null };
    const one = build([], [vesper([carrot])]).get("karotten@main")!;
    expect(one).toMatchObject({ label: "Karotte", purchase: { quantity: 1, unit: "Stück" } });
    // It adds up with what the recipes of the week need.
    const salad = recipe("salat", [line("karotten", 1, "Stück")]);
    const two = build([salad], [slot(MONDAY, "salat"), vesper([carrot])]).get("karotten@main")!;
    expect(two).toMatchObject({ label: "Karotten", purchase: { quantity: 2, unit: "Stück" } });
    // Named in the plural, it is a name without an amount.
    const some = build([], [vesper([{ ...carrot, label: "Karotten" }])]).get("karotten@main")!;
    expect(some).toMatchObject({ label: "Karotten", purchase: null });
    const tomatoes = { label: "Tomaten", ingredientId: "tomaten", shopId: null };
    expect(build([], [vesper([tomatoes])]).get("tomaten@main")!.purchase).toBeNull();
  });

  it("keeps a food apart that is bought somewhere else for that meal", () => {
    const usual = testIndex.ingredientById.get("brot")!.preferredShopId;
    const other = usual === "ec" ? "aldi" : "ec";
    const toast = recipe("toast", [line("brot", 1, "Stück")]);
    const lines = build(
      [toast],
      [
        slot(MONDAY, "toast"),
        vesper([
          { ...bread, shopId: other },
          { ...bread, label: "brot" },
        ]),
      ],
    );
    // Bread for cooking stays where the catalog buys it; bread for the supper is its own line.
    expect(lines.get("brot@main")).toMatchObject({ shopId: usual });
    expect(lines.get("brot@main")!.contributions).toHaveLength(2);
    expect(lines.get(`brot@main@${other}`)).toMatchObject({ shopId: other, label: "Brot" });
    // Naming the catalog's own shop is no exception.
    const same = build([], [vesper([{ ...bread, shopId: usual }])]);
    expect([...same.keys()]).toEqual(["brot@main"]);
  });

  it("does not assume a food someone asked for is at home", () => {
    const soup = recipe("suppe", [line("salz", null, null)]);
    expect(build([soup], [slot(MONDAY, "suppe")]).get("salz@main")!.defaultAtHome).toBe(true);
    const asked = build([], [vesper([{ label: "Salz", ingredientId: "salz", shopId: null }])]);
    expect(asked.get("salz@main")!.defaultAtHome).toBe(false);
  });

  it("buys a food late that does not keep until its meal", () => {
    const sunday = {
      ...vesper([{ label: "Tomaten", ingredientId: "tomaten", shopId: null }]),
      date: SUNDAY,
    };
    expect(build([], [sunday]).get("tomaten@main")).toBeDefined();
    const eggs = testIndex.ingredientById.get("eier")!;
    const fresh = { ...eggs, shelfLifeDays: 2 };
    const lines = buildShoppingList({
      index: {
        ...testIndex,
        ingredientById: new Map([...testIndex.ingredientById, ["eier", fresh]]),
      },
      recipes: [],
      slots: [{ ...vesper([{ label: "Eier", ingredientId: "eier", shopId: null }]), date: SUNDAY }],
      trips: singleTrip(MONDAY),
    });
    expect(lines.find((entry) => entry.key === "eier@later")).toMatchObject({ neededBy: SUNDAY });
  });

  it("adds the recipes a week needs outside its meals, scaled to what was asked for", () => {
    const cake = recipe("kuchen", [line("butter", 250, "g"), line("eier", 4, "Stück")], {
      min: 1,
      max: 1,
      unit: "Springform",
    });
    const lines = buildShoppingList({
      index: testIndex,
      recipes: [cake],
      slots: [],
      extras: [{ recipeId: "kuchen", servings: 2, note: "Einladung" }],
      trips: singleTrip(MONDAY),
    });
    const butter = lines.find((entry) => entry.ingredientId === "butter")!;
    expect(butter.amounts).toEqual([{ quantity: 500, unit: "g" }]);
    expect(butter.trip).toBe("main");
    expect(butter.contributions[0].source).toEqual({
      type: "extra",
      recipeId: "kuchen",
      recipeTitle: "kuchen",
      note: "Einladung",
      date: null,
    });
    const eggs = lines.find((entry) => entry.ingredientId === "eier")!;
    expect(eggs.amounts).toEqual([{ quantity: 8, unit: "Stück" }]);
  });

  it("sums an extra with the same ingredient of a meal", () => {
    const cake = recipe("kuchen", [line("eier", 4, "Stück")]);
    const lines = buildShoppingList({
      index: testIndex,
      recipes: [cake],
      slots: [slot(MONDAY, "kuchen")],
      extras: [{ recipeId: "kuchen", servings: 4, note: null }],
      trips: singleTrip(MONDAY),
    });
    expect(lines.filter((entry) => entry.ingredientId === "eier")).toHaveLength(1);
    expect(lines[0].amounts).toEqual([{ quantity: 8, unit: "Stück" }]);
  });
});

describe("several errands", () => {
  const SAT_BEFORE = "2026-10-10";
  const THURSDAY = "2026-10-15";
  const FRIDAY = "2026-10-16";
  const SATURDAY = "2026-10-17";
  const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-10-03", "2026-10-25");
  const on = (lines: ShoppingLine[], note: string) =>
    lines
      .filter((entry) => noteId({ date: entry.shoppingDate, place: entry.place }) === note)
      .map((entry) => entry.key)
      .sort();
  const lists = (
    recipes: Recipe[],
    slots: PlanSlot[],
    manualEntries: ManualEntry[] = [],
    moves?: Map<string, ShoppingTrip>,
  ) => buildShoppingList({ index: testIndex, recipes, slots, trips, manualEntries, moves });

  it("buys on the week's first errand what keeps, and later only what would not", () => {
    const soup = recipe("suppe", [line("sahne", 200, "ml"), line("joghurt", 150, "g")]);
    const lines = lists([soup], [slot(TUESDAY, "suppe"), slot(SUNDAY, "suppe")]);
    // The cream for Sunday keeps from Monday: one errand buys it for both meals.
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["joghurt@main", "sahne@main"]);
    expect(on(lines, `${FRIDAY}.supermarket`)).toEqual(["joghurt@main"]);
    expect(lines.find((entry) => entry.key === "sahne@main")!.amounts).toEqual([
      { quantity: 400, unit: "ml" },
    ]);
  });

  it("buys Friday's lunch on Monday, and of Friday's dinner on Friday what would not keep", () => {
    const soup = recipe("suppe", [line("sahne", 200, "ml"), line("joghurt", 150, "g")]);
    const lines = lists([soup], [{ ...slot(FRIDAY, "suppe"), meal: "lunch" }]);
    // The yoghurt would not keep from Monday: it is fetched shortly before.
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["joghurt@later", "sahne@main"]);
    const dinner = lists([soup], [slot(FRIDAY, "suppe")]);
    expect(on(dinner, `${MONDAY}.supermarket`)).toEqual(["sahne@main"]);
    expect(on(dinner, `${FRIDAY}.supermarket`)).toEqual(["joghurt@main"]);
  });

  it("sums per errand, not over the week", () => {
    const soup = recipe("suppe", [line("joghurt", 200, "g")]);
    const lines = lists(
      [soup],
      [slot(MONDAY, "suppe"), slot(THURSDAY, "suppe"), slot(SATURDAY, "suppe")],
    );
    const monday = lines.find((entry) => entry.shoppingDate === MONDAY)!;
    expect(monday.amounts).toEqual([{ quantity: 400, unit: "g" }]);
    expect(monday.purchase).toEqual({ quantity: 400, unit: "g" });
    expect(lines.find((entry) => entry.shoppingDate === FRIDAY)!.purchase).toEqual({
      quantity: 200,
      unit: "g",
    });
  });

  it("buys vegetables at the market on its day and meat at the butcher for each meal", () => {
    const roast = recipe("braten", [
      line("karotten", 4, "Stück"),
      line("leberkaese", 600, "g"),
      line("sahne", 200, "ml"),
    ]);
    const lines = lists([roast], [slot(SUNDAY, "braten"), slot(MONDAY, "braten")]);
    expect(on(lines, `${SATURDAY}.market`)).toEqual(["karotten@main"]);
    expect(on(lines, `${SAT_BEFORE}.market`)).toEqual(["karotten@main"]);
    // The butcher has no day of his own: Sunday's meat is bought on the Saturday, when the
    // shops are open, and Monday's on the Monday.
    expect(on(lines, `${SATURDAY}.butcher`)).toEqual(["leberkaese@main"]);
    expect(on(lines, `${MONDAY}.butcher`)).toEqual(["leberkaese@main"]);
    expect(on(lines, `${SAT_BEFORE}.butcher`)).toEqual([]);
    // What neither sells comes from the supermarket, for each week on its first errand.
    expect(on(lines, `${FRIDAY}.supermarket`)).toEqual([]);
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["sahne@main"]);
  });

  it("gives every meal with meat an errand to the butcher on its day", () => {
    const steaks = recipe("steaks", [line("steak", 4, "Stück")]);
    const lines = lists([steaks], [slot(SUNDAY, "steaks"), slot(TUESDAY, "steaks")]);
    expect(on(lines, `${SATURDAY}.butcher`)).toEqual(["steak@main"]);
    expect(on(lines, `${TUESDAY}.butcher`)).toEqual(["steak@main"]);
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual([]);
  });

  it("bundles the meat of several meals into one visit on a butcher day", () => {
    // The household names no butcher days: it goes there when it shops anyway, Monday,
    // Friday and Saturday. Meat for Monday, Wednesday and Thursday is one visit on Monday.
    const steaks = recipe("steaks", [line("steak", 4, "Stück")]);
    const lines = buildShoppingList({
      index: testIndex,
      recipes: [steaks],
      slots: [MONDAY, "2026-10-14", THURSDAY, FRIDAY, SUNDAY].map((date) => slot(date, "steaks")),
      trips,
      butcherDays: butcherWeekdays(DEFAULT_SHOPPING_DAYS),
    });
    const butcher = lines.filter((entry) => entry.place === "butcher");
    expect(butcher.map((entry) => [entry.shoppingDate, entry.purchase?.quantity])).toEqual([
      [MONDAY, 12],
      [FRIDAY, 4],
      [SATURDAY, 4],
    ]);
  });

  it("leaves a market day that is over out of a meal planned after it", () => {
    const stew = recipe("eintopf", [line("karotten", 4, "Stück")]);
    const planned = (plannedOn: string): PlanSlot => ({
      id: "s",
      date: MONDAY,
      meal: "lunch",
      kind: "recipes",
      items: [{ recipeId: "eintopf", servings: 4, plannedOn }],
    });
    expect(on(lists([stew], [planned("2026-10-11")]), `${MONDAY}.supermarket`)).toEqual([
      "karotten@main",
    ]);
    expect(on(lists([stew], [planned(SAT_BEFORE)]), `${SAT_BEFORE}.market`)).toEqual([
      "karotten@main",
    ]);
  });

  it("marks a meal planned after its shopping day as bought shortly before", () => {
    const soup = recipe("suppe", [line("sahne", 200, "ml")]);
    const late: PlanSlot = {
      id: "s",
      date: THURSDAY,
      meal: "dinner",
      kind: "recipes",
      items: [{ recipeId: "suppe", servings: 4, plannedOn: "2026-10-14" }],
    };
    const [only] = lists([soup], [late]);
    expect(only).toMatchObject({ shoppingDate: MONDAY, place: "supermarket", trip: "later" });
  });

  it("says the day something is needed only for what goes bad", () => {
    // Planned on Wednesday for Thursday, after Monday's shopping: both are bought in
    // between. Tomatoes keep a week and say for when; cream is simply on the list.
    const sauce = recipe("sosse", [line("tomaten", 4, "Stück"), line("sahne", 200, "ml")]);
    const late: PlanSlot = {
      id: "s",
      date: THURSDAY,
      meal: "dinner",
      kind: "recipes",
      items: [{ recipeId: "sosse", servings: 4, plannedOn: "2026-10-14" }],
    };
    const lines = new Map(lists([sauce], [late]).map((entry) => [entry.ingredientId, entry]));
    expect(lines.get("tomaten")).toMatchObject({ trip: "later", neededBy: THURSDAY });
    expect(lines.get("sahne")).toMatchObject({ trip: "later", neededBy: null });
  });

  it("gives the bread and the cold cuts of a supper a note of their own on that day", () => {
    const supper: PlanSlot = {
      id: "v",
      date: THURSDAY,
      meal: "dinner",
      kind: "free_text",
      label: "Vesper",
      foods: [
        { label: "Brot", ingredientId: "brot", shopId: "baecker" },
        { label: "Leberkäse", ingredientId: "leberkaese", shopId: "metzger" },
        { label: "Milch", ingredientId: "milch", shopId: null },
      ],
    };
    const lines = lists([], [supper]);
    expect(on(lines, `${THURSDAY}.bakery`)).toEqual(["brot@main@baecker"]);
    // The butcher's Saturday does not reach Thursday.
    expect(on(lines, `${THURSDAY}.butcher`)).toEqual(["leberkaese@main@metzger"]);
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["milch@main"]);
  });

  it("puts the bread of a meal on the bakery's note when the bakery sells bread", () => {
    // "Brot & Backwaren" from the bakery; toast keeps for ten days and is packed.
    const fromTheBakery = createCatalogIndex({
      ...testCatalog,
      aisleGroups: testCatalog.aisleGroups.map((group) =>
        group.id === "brot" ? { ...group, freshPlace: "bakery" as const } : group,
      ),
      ingredients: [
        ...testCatalog.ingredients.map((each) =>
          each.id === "brot" ? { ...each, shelfLifeDays: 3 } : each,
        ),
        {
          ...(testCatalog.ingredients.find((each) => each.id === "brot") as Ingredient),
          id: "toast",
          name: "Toast",
          shelfLifeDays: 10,
        },
      ],
    });
    const soup = recipe("suppe", [line("brot", 1, "Stück"), line("toast", 1, "Stück")]);
    const lines = buildShoppingList({
      index: fromTheBakery,
      recipes: [soup],
      slots: [slot("2026-10-14", "suppe")],
      trips,
      manualEntries: [],
    });
    expect(on(lines, `2026-10-14.bakery`)).toEqual(["brot@main"]);
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["toast@main"]);
  });

  it("keeps a typed line on the note it was written on", () => {
    const lines = lists(
      [],
      [],
      [
        { id: "a", text: "Milch", shoppingDate: FRIDAY, place: "supermarket" },
        { id: "b", text: "Geschenkpapier", shoppingDate: SATURDAY, place: "market" },
        { id: "c", text: "Milch", shoppingDate: MONDAY, place: "supermarket" },
      ],
    );
    expect(on(lines, `${FRIDAY}.supermarket`)).toEqual(["milch@main"]);
    expect(on(lines, `${SATURDAY}.market`)).toEqual(["manual:b"]);
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["milch@main"]);
  });

  it("moves a line to another note, where it adds up with what is there", () => {
    const soup = recipe("suppe", [line("joghurt", 200, "g")]);
    const slots = [slot(TUESDAY, "suppe"), slot(SUNDAY, "suppe")];
    const friday = { date: FRIDAY, place: "supermarket" as const };
    const monday = { date: MONDAY, place: "supermarket" as const };
    const lines = lists([soup], slots, [], new Map([[moveKey(monday, "joghurt@main"), friday]]));
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual([]);
    const [cream] = lines;
    expect(lines).toHaveLength(1);
    expect(cream).toMatchObject({ shoppingDate: FRIDAY, key: "joghurt@main" });
    expect(cream.amounts).toEqual([{ quantity: 400, unit: "g" }]);
    // Each part still knows the note it would be on by itself.
    expect(cream.contributions.map((part) => part.origin)).toEqual([monday, friday]);
  });

  it("buys what was planned after an errand was done on the next one in time", () => {
    const soup = recipe("suppe", [line("sahne", 200, "ml")]);
    const shopped = Date.parse("2026-10-12T15:00:00Z");
    const planned = (date: string, plannedAt: number): PlanSlot => ({
      id: date,
      date,
      meal: "dinner",
      kind: "recipes",
      items: [{ recipeId: "suppe", servings: 4, plannedOn: MONDAY, plannedAt }],
    });
    const lines = buildShoppingList({
      index: testIndex,
      recipes: [soup],
      // Wednesday's soup was planned before the shopping, Saturday's after it.
      slots: [planned("2026-10-14", shopped - 1000), planned(SATURDAY, shopped + 1000)],
      trips,
      doneAt: new Map([[`${MONDAY}.supermarket`, shopped]]),
    });
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["sahne@main"]);
    expect(on(lines, `${FRIDAY}.supermarket`)).toEqual(["sahne@main"]);
    const friday = lines.find((entry) => entry.shoppingDate === FRIDAY)!;
    expect(friday.contributions[0].plannedAt).toBe(shopped + 1000);
  });

  it("knows the notes the parts of a moved line came from", () => {
    const soup = recipe("suppe", [line("joghurt", 200, "g")]);
    const moves = new Map([
      [
        moveKey({ date: MONDAY, place: "supermarket" }, "joghurt@main"),
        { date: FRIDAY, place: "supermarket" as const },
      ],
    ]);
    const lines = lists([soup], [slot(TUESDAY, "suppe"), slot(SUNDAY, "suppe")], [], moves);
    const friday = lines.find((entry) => entry.shoppingDate === FRIDAY)!;
    expect(originsOf(friday, { date: FRIDAY, place: "supermarket" })).toEqual([
      { date: MONDAY, place: "supermarket" },
      { date: FRIDAY, place: "supermarket" },
    ]);
  });

  it("moves a typed line and a line the catalog does not know", () => {
    const market = { date: SATURDAY, place: "market" as const };
    const monday = { date: MONDAY, place: "supermarket" as const };
    const lines = lists(
      [],
      [],
      [{ id: "b", text: "Geschenkpapier", shoppingDate: MONDAY, place: "supermarket" }],
      new Map([[moveKey(monday, "manual:b"), market]]),
    );
    expect(on(lines, `${SATURDAY}.market`)).toEqual(["manual:b"]);
  });

  it("buys the extras on the supermarket day named for them", () => {
    const cake = recipe("kuchen", [line("butter", 250, "g")]);
    const lines = buildShoppingList({
      index: testIndex,
      recipes: [cake],
      slots: [],
      extras: [{ recipeId: "kuchen", servings: 4, note: null }],
      trips,
      extrasDate: MONDAY,
    });
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["butter@main"]);
  });

  it("buys an extra without a day that came after the first errand on the next one", () => {
    const cake = recipe("kuchen", [line("sahne", 200, "ml")]);
    const shopped = Date.parse("2026-10-12T15:00:00Z");
    const extra = (plannedAt: number) =>
      buildShoppingList({
        index: testIndex,
        recipes: [cake],
        slots: [],
        extras: [{ recipeId: "kuchen", servings: 4, note: null, plannedOn: MONDAY, plannedAt }],
        trips,
        extrasDate: MONDAY,
        doneAt: new Map([[`${MONDAY}.supermarket`, shopped]]),
      }).map((entry) => `${entry.shoppingDate}.${entry.place}/${entry.trip}`);
    expect(extra(shopped - 1000)).toEqual([`${MONDAY}.supermarket/main`]);
    expect(extra(shopped + 1000)).toEqual([`${FRIDAY}.supermarket/main`]);
  });

  it("buys an extra for a day like a meal on that day", () => {
    const cake = recipe("kuchen", [
      line("butter", 250, "g"),
      line("joghurt", 150, "g"),
      line("karotten", 4, "Stück"),
      line("tomaten", 2, "Stück"),
    ]);
    const lines = buildShoppingList({
      index: testIndex,
      recipes: [cake],
      slots: [],
      extras: [{ recipeId: "kuchen", servings: 4, note: "Einladung", date: SATURDAY }],
      trips,
      extrasDate: MONDAY,
    });
    // Bought like a meal on Saturday: what keeps on the week's first errand, the yoghurt
    // on the last one before Saturday.
    expect(on(lines, `${MONDAY}.supermarket`)).toEqual(["butter@main"]);
    expect(on(lines, `${FRIDAY}.supermarket`)).toEqual(["joghurt@main"]);
    expect(on(lines, `${SATURDAY}.market`)).toEqual(["karotten@main", "tomaten@main"]);
    const tomatoes = lines.find((entry) => entry.ingredientId === "tomaten")!;
    expect(tomatoes.contributions[0].source).toMatchObject({ type: "extra", date: SATURDAY });
  });

  it("buys an extra added after its shopping day shortly before it is needed", () => {
    const cake = recipe("kuchen", [line("sahne", 200, "ml")]);
    const [cream] = buildShoppingList({
      index: testIndex,
      recipes: [cake],
      slots: [],
      extras: [
        { recipeId: "kuchen", servings: 4, note: null, date: THURSDAY, plannedOn: "2026-10-14" },
      ],
      trips,
      extrasDate: MONDAY,
    });
    expect(cream).toMatchObject({ shoppingDate: MONDAY, place: "supermarket", trip: "later" });
  });

  it("refuses to build a list without a shopping day", () => {
    expect(() =>
      buildShoppingList({ index: testIndex, recipes: [], slots: [], trips: [] }),
    ).toThrow(/shopping day/);
  });
});
