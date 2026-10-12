import { describe, expect, it } from "vitest";
import type { PlanSlot } from "../plan";
import type { Recipe, RecipeIngredient, Servings } from "../recipe";
import { buildShoppingList, tripFor, toDefaultUnit } from "./build";
import { line, testIndex } from "./test-catalog";
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

function slot(date: string, recipeId: string, servings = 4): PlanSlot {
  return {
    id: `${date}-${recipeId}`,
    date,
    meal: "lunch",
    kind: "recipes",
    items: [{ recipeId, servings }],
  };
}

function build(recipes: Recipe[], slots: PlanSlot[], manualEntries: ManualEntry[] = []) {
  const lines = buildShoppingList({
    index: testIndex,
    recipes,
    slots,
    shoppingDate: MONDAY,
    manualEntries,
  });
  return new Map<string, ShoppingLine>(lines.map((l) => [l.key, l]));
}

describe("tripFor", () => {
  it("buys on the shopping day what keeps until it is needed", () => {
    expect(tripFor(SUNDAY, MONDAY, null)).toBe("main");
    expect(tripFor(SUNDAY, MONDAY, 6)).toBe("main");
    expect(tripFor(SUNDAY, MONDAY, 5)).toBe("later");
    expect(tripFor(TUESDAY, MONDAY, 1)).toBe("main");
    expect(tripFor(MONDAY, MONDAY, 0)).toBe("main");
  });
});

describe("toDefaultUnit", () => {
  const prawns = testIndex.ingredientById.get("garnelen")!;
  const carrots = testIndex.ingredientById.get("karotten")!;

  it("reads packs and bare counts of a pack ingredient as packs", () => {
    expect(toDefaultUnit(prawns, { quantity: 2, unit: "Packung" })).toBe(450);
    expect(toDefaultUnit(prawns, { quantity: 2, unit: "Stück" })).toBe(450);
    expect(toDefaultUnit(prawns, { quantity: 300, unit: "g" })).toBe(300);
  });

  it("returns null when there is no conversion path", () => {
    expect(toDefaultUnit(carrots, { quantity: 1, unit: "Bund" })).toBeNull();
    expect(toDefaultUnit(carrots, { quantity: 300, unit: "g" })).toBe(3);
  });
});

describe("buildShoppingList", () => {
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

  it("merges units that convert and shows a multiplier only beyond one pack", () => {
    const sauce = recipe("sauce", [line("sahne", 150, "ml"), line("sahne", 2, "EL")]);
    const one = build([sauce], [slot(MONDAY, "sauce")]).get("sahne@main")!;
    expect(one.amounts).toEqual([{ quantity: 180, unit: "ml" }]);
    expect(one.purchase).toBeNull();

    const two = build([sauce], [slot(MONDAY, "sauce", 8)]).get("sahne@main")!;
    expect(two.amounts).toEqual([{ quantity: 360, unit: "ml" }]);
    expect(two.purchase).toEqual({ quantity: 2, unit: "Packung" });
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

  it("needs only one line for an ingredient that shows no quantity", () => {
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
    const ginger = lines.get("ingwer@main")!;
    expect(lines.size).toBe(1);
    expect(ginger.purchase).toBeNull();
    expect(ginger.amounts).toEqual([
      { quantity: 20, unit: "g" },
      { quantity: 1, unit: "Stück" },
    ]);
    expect(ginger.hasUnquantified).toBe(true);
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
    expect([...lines.keys()]).toEqual(["ingwer@main"]);
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
      expect(lines.get("ingwer@main")!.defaultAtHome).toBe(false);
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
      expect(lines.get("sahne@main")!.purchase).toEqual({ quantity: 3, unit: "Packung" });
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
      expect(lines.get("garnelen@main")!.purchase).toEqual({ quantity: 2, unit: "Packung" });
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
  });

  it("lists a recipe line that is not mapped to the catalog under its printed text", () => {
    const lines = build(
      [recipe("a", [line(null, 1, "Stück", { originalText: "1 Sternfrucht" })])],
      [slot(MONDAY, "a"), slot(TUESDAY, "a")],
    );
    const loose = lines.get("unmapped:1sternfrucht")!;
    expect(loose).toMatchObject({
      label: "1 Sternfrucht",
      ingredientId: null,
      aisleGroupId: "sonstiges",
    });
    expect(loose.contributions).toHaveLength(2);
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
    expect(lines.get("ingwer@main")!.optional).toBe(true);
    expect(lines.get("tomaten@main")!.optional).toBe(false);
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
      shoppingDate: MONDAY,
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
      shoppingDate: MONDAY,
    });
    const butter = lines.find((entry) => entry.ingredientId === "butter")!;
    expect(butter.amounts).toEqual([{ quantity: 500, unit: "g" }]);
    expect(butter.trip).toBe("main");
    expect(butter.contributions[0].source).toEqual({
      type: "extra",
      recipeId: "kuchen",
      recipeTitle: "kuchen",
      note: "Einladung",
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
      shoppingDate: MONDAY,
    });
    expect(lines.filter((entry) => entry.ingredientId === "eier")).toHaveLength(1);
    expect(lines[0].amounts).toEqual([{ quantity: 8, unit: "Stück" }]);
  });
});
