import { describe, expect, it } from "vitest";
import { addDays, type IsoDate } from "../dates";
import { summary } from "../library/testing";
import type { RecipeSummary } from "../library/summary";
import type { Meal, PlanSlot } from "../plan";
import { DEFAULT_TARGETS } from "../recommend/balance";
import type { SeasonalFood } from "../season/calendar";
import { kindOfMeal, mealStats, type MealStatsInput } from "./meals";
import { periodOf } from "./period";

const recipes = [
  summary("curry", {
    title: "Gemüsecurry",
    proteinType: "vegan",
    sourceBook: "Zweites Buch",
    tags: ["schnell", "indisch"],
  }),
  summary("lachs", {
    title: "Lachs",
    proteinType: "fish",
    sourceBook: "E2E Kochbuch",
    tags: ["lachs"],
  }),
  summary("steak", {
    title: "Steak",
    proteinType: "red_meat",
    sourceBook: "E2E Kochbuch",
    tags: ["aufwendig", "rind"],
  }),
  summary("huhn", {
    title: "Hähnchen",
    proteinType: "poultry",
    sourceBook: "Zweites Buch",
    isFavorite: true,
  }),
  summary("kuchen", {
    title: "Apfelkuchen",
    category: "kuchen",
    proteinType: "vegetarian",
    sourceBook: null,
  }),
  summary("suppe", {
    title: "Kürbissuppe",
    category: "suppe-eintopf",
    proteinType: "vegan",
    sourceBook: "E2E Kochbuch",
    addedOn: "2026-10-20",
  }),
];
const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

let id = 0;
function cooked(date: IsoDate, meal: Meal, ...ids: string[]): PlanSlot {
  return {
    id: `s${id++}`,
    date,
    meal,
    kind: "recipes",
    items: ids.map((recipeId) => ({ recipeId, servings: 4 })),
  };
}

function input(slots: PlanSlot[], patch: Partial<MealStatsInput> = {}): MealStatsInput {
  return {
    period: periodOf("month", "2026-10-14"),
    today: "2026-10-25",
    firstWeek: null,
    slots,
    recipes: byId,
    targets: DEFAULT_TARGETS,
    tags: new Map([
      ["lachs", { name: "Lachs & Forelle", group: "Hauptzutat" }],
      ["rind", { name: "Rind & Kalb", group: "Hauptzutat" }],
      ["indisch", { name: "Indisch", group: "Küche" }],
      ["schnell", { name: "Schnell", group: "Aufwand" }],
    ]),
    seasonalFoods: new Map(),
    ...patch,
  };
}

describe("kind of a meal", () => {
  it("is its heaviest protein, sweet for a cake, and nothing else otherwise", () => {
    expect(kindOfMeal([byId.get("curry")!, byId.get("steak")!])).toBe("red_meat");
    expect(kindOfMeal([byId.get("kuchen")!])).toBe("sweet");
    expect(kindOfMeal([summary("x", { proteinType: "none" })])).toBe("other");
  });
});

describe("meal statistics", () => {
  it("counts only the days that have been, and not before the first week", () => {
    const stats = mealStats(
      input(
        [
          cooked("2026-10-12", "lunch", "steak"), // before the first week
          cooked("2026-10-19", "lunch", "curry"),
          cooked("2026-10-19", "dinner", "lachs"),
          { id: "v", date: "2026-10-20", meal: "dinner", kind: "free_text", label: "Vesper" },
          cooked("2026-10-28", "lunch", "huhn"), // still to come
        ],
        { firstWeek: "2026-10-19" },
      ),
    );
    expect(stats.mealsPossible).toBe(14);
    expect(stats.entered).toBe(3);
    expect(stats.cooked).toBe(2);
    expect(stats.ahead).toBe(1);
    expect(stats.kinds).toMatchObject({ vegetarian: 1, fish: 1, red_meat: 0 });
  });

  it("judges each planned week against the goals, a week without cooking not at all", () => {
    const week = (monday: IsoDate, ids: string[]) =>
      ids.map((recipe, at) => cooked(addDays(monday, at), "lunch", recipe));
    const stats = mealStats(
      input([
        ...week("2026-10-05", ["curry", "curry", "curry", "lachs"]),
        ...week("2026-10-12", ["steak", "steak", "steak", "curry"]),
      ]),
    );
    expect(stats.goals.enough).toBe(true);
    if (!stats.goals.enough) return;
    expect(stats.goals.value.weeks.map((entry) => entry.weekStart)).toEqual([
      "2026-10-05",
      "2026-10-12",
    ]);
    const { summary: lines } = stats.goals.value;
    const of = (group: string) => lines.find((line) => line.group === group)!;
    expect(of("vegetarian")).toMatchObject({ met: 1, weeks: 2, average: 2 });
    expect(of("red_meat")).toMatchObject({ met: 1, weeks: 2, average: 1.5 });
    expect(of("fish")).toMatchObject({ met: 1, weeks: 2 });
  });

  it("judges a running week only once it is decided", () => {
    // Today is Sunday the 25th: the week of the 19th still runs.
    const stats = mealStats(
      input([
        cooked("2026-10-19", "lunch", "curry"),
        cooked("2026-10-20", "lunch", "steak"),
        cooked("2026-10-21", "lunch", "steak"),
        cooked("2026-10-22", "lunch", "steak"),
      ]),
    );
    expect(stats.goals.enough).toBe(true);
    if (!stats.goals.enough) return;
    const { summary: lines, weeks } = stats.goals.value;
    expect(weeks[0].running).toBe(true);
    // One vegetarian meal of at least three: not decided while the week runs.
    expect(lines.find((line) => line.group === "vegetarian")).toMatchObject({ met: 0, weeks: 0 });
    // Three of red meat, two at most: missed already.
    expect(lines.find((line) => line.group === "red_meat")).toMatchObject({ met: 0, weeks: 1 });
    // No poultry, two at most: met so far.
    expect(lines.find((line) => line.group === "poultry")).toMatchObject({ met: 1, weeks: 1 });
  });

  it("calls a trend of one week too little, and draws one of two", () => {
    const one = mealStats(input([cooked("2026-10-19", "lunch", "curry")]));
    expect(one.trend).toEqual({ enough: false, have: 1, need: 2 });
    const two = mealStats(
      input([cooked("2026-10-12", "lunch", "curry"), cooked("2026-10-19", "lunch", "steak")]),
    );
    expect(two.trend.enough).toBe(true);
    if (!two.trend.enough) return;
    const bar = two.trend.value.find((entry) => entry.key === "2026-10-19")!;
    expect(bar.counts.red_meat).toBe(1);
    expect(bar.opens).toEqual({ kind: "week", key: "2026-10-19" });
  });

  it("ranks only what was cooked more than once", () => {
    const once = mealStats(input([cooked("2026-10-19", "lunch", "curry")]));
    expect(once.top).toEqual({ enough: false, have: 1, need: 2 });
    const stats = mealStats(
      input([
        cooked("2026-10-05", "lunch", "curry"),
        cooked("2026-10-12", "lunch", "curry"),
        cooked("2026-10-13", "lunch", "lachs"),
        cooked("2026-10-14", "lunch", "lachs"),
        cooked("2026-10-15", "lunch", "curry"),
        cooked("2026-10-16", "lunch", "steak"),
      ]),
    );
    expect(stats.top).toEqual({
      enough: true,
      value: [
        { id: "curry", title: "Gemüsecurry", count: 3, last: "2026-10-15" },
        { id: "lachs", title: "Lachs", count: 2, last: "2026-10-14" },
      ],
    });
    expect(stats.variety).toEqual({ enough: true, value: { distinct: 3, meals: 6 } });
  });

  it("finds the dishes tried for the first time, once there is a history to be new against", () => {
    const history = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"].map((monday) =>
      cooked(monday, "lunch", "curry"),
    );
    const stats = mealStats(
      input([
        ...history,
        cooked("2026-10-06", "lunch", "curry"),
        cooked("2026-10-07", "dinner", "lachs"),
      ]),
    );
    expect(stats.newTried.enough && stats.newTried.value.map((entry) => entry.id)).toEqual([
      "lachs",
    ]);
    const early = mealStats(input([cooked("2026-10-07", "dinner", "lachs")]));
    expect(early.newTried).toEqual({ enough: false, have: 0, need: 4 });
  });

  it("brings up dishes not cooked for eight weeks, favourites first", () => {
    const stats = mealStats(
      input([
        cooked("2026-07-01", "lunch", "steak"),
        cooked("2026-07-02", "lunch", "steak"),
        cooked("2026-07-03", "lunch", "huhn"),
        cooked("2026-07-04", "lunch", "kuchen"), // a cake is no dish to bring up
        cooked("2026-10-20", "lunch", "curry"),
      ]),
    );
    expect(stats.again.enough && stats.again.value.map((entry) => entry.id)).toEqual([
      "huhn",
      "steak",
    ]);
  });

  it("counts meals without a recipe by what they were", () => {
    const stats = mealStats(
      input([
        { id: "a", date: "2026-10-19", meal: "dinner", kind: "free_text", label: "Vesper" },
        { id: "b", date: "2026-10-20", meal: "dinner", kind: "free_text", label: "vesper" },
        { id: "c", date: "2026-10-21", meal: "lunch", kind: "away", label: "Oma Heidrun" },
        { id: "d", date: "2026-10-22", meal: "lunch", kind: "leftovers", ofSlotId: "x" },
        { id: "e", date: "2026-10-23", meal: "lunch", kind: "skipped" },
        cooked("2026-10-19", "lunch", "curry"),
      ]),
    );
    expect(stats.without.enough && stats.without.value).toEqual({
      total: 5,
      rows: [
        { label: "Vesper", kind: "free_text", count: 2, lastWeek: "2026-10-19" },
        { label: "Keiner daheim", kind: "skipped", count: 1, lastWeek: "2026-10-19" },
        { label: "Oma Heidrun", kind: "away", count: 1, lastWeek: "2026-10-19" },
        { label: "Reste", kind: "leftovers", count: 1, lastWeek: "2026-10-19" },
      ],
    });
    expect(stats.leftovers).toEqual({ extraPortions: 0, leftoverMeals: 1, linked: 1 });
  });

  it("says which cookbooks are cooked from, and how much of each ever was", () => {
    const stats = mealStats(
      input([
        cooked("2026-10-19", "lunch", "lachs"),
        cooked("2026-10-20", "lunch", "lachs"),
        cooked("2026-10-21", "lunch", "curry"),
      ]),
    );
    expect(stats.books.enough && stats.books.value).toEqual([
      { book: "E2E Kochbuch", meals: 2, recipes: 1, everCooked: 1, inLibrary: 3 },
      { book: "Zweites Buch", meals: 1, recipes: 1, everCooked: 1, inLibrary: 2 },
    ]);
  });

  it("counts main ingredients and cuisines once per meal", () => {
    const stats = mealStats(
      input([
        cooked("2026-10-19", "lunch", "lachs"),
        cooked("2026-10-20", "lunch", "lachs"),
        cooked("2026-10-21", "lunch", "steak", "curry"),
      ]),
    );
    expect(stats.mainIngredients.enough && stats.mainIngredients.value).toEqual([
      { ref: "lachs", name: "Lachs & Forelle", count: 2 },
      { ref: "rind", name: "Rind & Kalb", count: 1 },
    ]);
    expect(stats.cuisines).toEqual({ enough: false, have: 1, need: 3 });
  });

  it("tells working days from the weekend by the effort of each meal", () => {
    const stats = mealStats(
      input([
        cooked("2026-10-19", "lunch", "curry"), // Monday, quick
        cooked("2026-10-20", "lunch", "curry", "steak"), // the steak takes time
        cooked("2026-10-24", "lunch", "steak"), // Saturday
        cooked("2026-10-25", "lunch", "lachs"), // Sunday, 30 minutes: quick
      ]),
    );
    expect(stats.effort.enough && stats.effort.value).toEqual({
      workday: { schnell: 1, alltag: 0, aufwendig: 1, unknown: 0 },
      weekend: { schnell: 1, alltag: 0, aufwendig: 1, unknown: 0 },
    });
  });

  it("counts the meals that fit the season of their month, and what made them fit", () => {
    const pumpkin: SeasonalFood = {
      key: "kuerbis",
      name: "Kürbis",
      kind: "gemuese",
      fresh: [9, 10, 11],
      names: ["Kürbis"],
    };
    const stats = mealStats(
      input(
        [
          cooked("2026-10-19", "lunch", "suppe"),
          cooked("2026-10-20", "lunch", "suppe"),
          cooked("2026-10-21", "lunch", "curry"),
          cooked("2026-10-22", "lunch", "lachs"),
        ],
        { seasonalFoods: new Map([["suppe", [pumpkin]]]) },
      ),
    );
    expect(stats.season.enough && stats.season.value).toEqual({
      fitting: 2,
      meals: 4,
      foods: [{ name: "Kürbis", count: 2 }],
    });
  });

  it("finds the days without meat and the longest run of them", () => {
    const stats = mealStats(
      input([
        cooked("2026-10-19", "lunch", "curry"),
        cooked("2026-10-20", "lunch", "lachs"),
        cooked("2026-10-21", "lunch", "steak"),
        cooked("2026-10-22", "lunch", "curry"),
        cooked("2026-10-22", "dinner", "huhn"),
        cooked("2026-10-23", "lunch", "curry"),
      ]),
    );
    expect(stats.meatFree).toEqual({ days: 3, ofDays: 5, longestRun: 2 });
  });

  it("counts Sundays with coffee and cake, and the recipes added in the period", () => {
    const stats = mealStats(
      input([cooked("2026-10-18", "coffee", "kuchen"), cooked("2026-10-21", "lunch", "suppe")]),
    );
    expect(stats.coffee).toMatchObject({ sundays: 4, withCake: 1 });
    expect(stats.coffee.cakes.map((cake) => cake.id)).toEqual(["kuchen"]);
    expect(stats.library).toEqual({ added: 1, addedCooked: 1 });
  });

  it("counts a meal whose recipe is gone as neither kind", () => {
    const none = new Map<string, RecipeSummary>();
    const stats = mealStats(input([cooked("2026-10-19", "lunch", "weg")], { recipes: none }));
    expect(stats.kinds.other).toBe(1);
  });
});
