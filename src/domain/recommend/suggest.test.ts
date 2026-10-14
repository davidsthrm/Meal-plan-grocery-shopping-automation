import { describe, expect, it } from "vitest";
import { summary } from "../library/testing";
import type { RecipeSummary } from "../library/summary";
import { groupOf, weekBalance, withMeal, type BalanceLine } from "./balance";
import type { Meal } from "../plan";
import { scoreRecipe, suggest, suggestWeek, suitsDay, type SuggestContext } from "./suggest";

const emptyWeek = weekBalance([], () => undefined);
const context = (patch: Partial<SuggestContext> = {}): SuggestContext => ({
  balance: emptyWeek,
  planned: new Set(),
  history: new Map(),
  weekStart: "2026-10-12",
  seed: "test",
  ...patch,
});
const after = (...groups: Parameters<typeof withMeal>[1][]): BalanceLine[] =>
  groups.reduce<BalanceLine[]>((balance, group) => withMeal(balance, group), emptyWeek);

/** A meal of the Saturday of the test week, when anything may be cooked. */
const SATURDAY = "2026-10-17";
const WEDNESDAY = "2026-10-14";
const at = (meal: Meal, date = SATURDAY) => ({ date, meal });

const lasagne = summary("lasagne");
const salmon = summary("lachs", { proteinType: "fish" });
const chicken = summary("huhn", { proteinType: "poultry" });
const steak = summary("steak", { proteinType: "red_meat" });

describe("scoreRecipe", () => {
  it("prefers what the week still lacks, and says so", () => {
    expect(scoreRecipe(salmon, context())).toMatchObject({
      score: 3,
      reasons: [{ kind: "fills_gap", group: "fish" }],
    });
    // One fish dish is planned: fish is no longer missing.
    expect(scoreRecipe(salmon, context({ balance: after("fish") }))).toMatchObject({
      score: 0,
      reasons: [],
    });
    expect(scoreRecipe(chicken, context())).toMatchObject({ score: 0, reasons: [] });
  });

  it("holds back a group the week has enough of", () => {
    expect(scoreRecipe(steak, context({ balance: after("red_meat", "red_meat") }))).toMatchObject({
      score: -4,
      reasons: [{ kind: "group_full", group: "red_meat" }],
    });
  });

  it("prefers favourites", () => {
    expect(scoreRecipe({ ...chicken, isFavorite: true }, context())).toMatchObject({
      score: 2,
      reasons: [{ kind: "favorite" }],
    });
  });

  it("holds back what was on the plan in the last weeks", () => {
    const history = new Map([["huhn", "2026-09-30"]]);
    expect(scoreRecipe(chicken, context({ history }))).toMatchObject({
      score: -3,
      reasons: [{ kind: "recent", weeks: 2 }],
    });
  });

  it("brings back what the household has not cooked for a long time", () => {
    const history = new Map([["huhn", "2026-07-06"]]);
    expect(scoreRecipe(chicken, context({ history }))).toMatchObject({
      score: 1,
      reasons: [{ kind: "long_ago", weeks: 14 }],
    });
    // Between "just had it" and "long ago", the history says nothing.
    expect(
      scoreRecipe(chicken, context({ history: new Map([["huhn", "2026-09-07"]]) })).reasons,
    ).toEqual([]);
  });

  it("puts what someone wants to cook before everything else", () => {
    const wish = scoreRecipe({ ...steak, wanted: true }, context());
    expect(wish.reasons).toEqual([{ kind: "wanted" }]);
    const favourite = scoreRecipe({ ...salmon, isFavorite: true }, context());
    expect(wish.score).toBeGreaterThan(favourite.score);
    // Even when the week has enough meat already.
    const full = context({ balance: after("red_meat", "red_meat") });
    expect(scoreRecipe({ ...steak, wanted: true }, full).score).toBeGreaterThan(
      scoreRecipe(salmon, full).score,
    );
  });

  it("adds everything up", () => {
    const history = new Map([["lachs", "2026-06-01"]]);
    const result = scoreRecipe({ ...salmon, isFavorite: true }, context({ history }));
    expect(result.score).toBe(6);
    expect(result.reasons.map((reason) => reason.kind)).toEqual([
      "fills_gap",
      "favorite",
      "long_ago",
    ]);
  });
});

describe("suitsDay", () => {
  const quick = summary("omelett", { prepMinutes: 15 });
  const normal = summary("auflauf", { prepMinutes: 50 });
  const long = summary("braten", { prepMinutes: 150 });
  const unknown = summary("ohne zeit", { prepMinutes: null });

  it("keeps long cooking out of the days from Monday to Friday", () => {
    expect(suitsDay(long, at("lunch", WEDNESDAY))).toBe(false);
    expect(suitsDay(long, at("dinner", WEDNESDAY))).toBe(false);
    expect(suitsDay(long, at("lunch"))).toBe(true);
    expect(suitsDay(long, at("dinner", "2026-10-18"))).toBe(true);
  });

  it("takes what fits a normal day for lunch, and only what is quick in the evening", () => {
    expect(suitsDay(normal, at("lunch", WEDNESDAY))).toBe(true);
    expect(suitsDay(normal, at("dinner", WEDNESDAY))).toBe(false);
    expect(suitsDay(quick, at("dinner", WEDNESDAY))).toBe(true);
  });

  it("goes by the tag where the household set one", () => {
    const tagged = { ...quick, tags: ["aufwendig"] };
    expect(suitsDay(tagged, at("dinner", WEDNESDAY))).toBe(false);
    expect(suitsDay({ ...unknown, tags: ["schnell"] }, at("dinner", WEDNESDAY))).toBe(true);
  });

  it("keeps a recipe whose effort nobody knows for the weekend", () => {
    expect(suitsDay(unknown, at("lunch", WEDNESDAY))).toBe(false);
    expect(suitsDay(unknown, at("lunch"))).toBe(true);
  });

  it("lets a cold supper or a salad pass on any evening", () => {
    const supper = summary("wurstsalat", { category: "vesper", prepMinutes: null });
    expect(suitsDay(supper, at("dinner", WEDNESDAY))).toBe(true);
    expect(suitsDay({ ...supper, tags: ["aufwendig"] }, at("dinner", WEDNESDAY))).toBe(false);
  });

  it("suggests nothing heavy for the evening, on any day", () => {
    const spaghetti = summary("Avocado Spaghetti", { prepMinutes: 20 });
    const risotto = summary("Pilzrisotto", { prepMinutes: 25 });
    const tagged = summary("Ofenkartoffeln", { prepMinutes: 25, tags: ["kartoffeln"] });
    for (const recipe of [spaghetti, risotto, tagged]) {
      expect(suitsDay(recipe, at("dinner", WEDNESDAY))).toBe(false);
      expect(suitsDay(recipe, at("dinner", "2026-10-18"))).toBe(false);
      expect(suitsDay(recipe, at("lunch", WEDNESDAY))).toBe(true);
    }
  });

  it("finds a soup, a wrap, toast from the oven or a pasta salad light enough", () => {
    const light = [
      summary("Linsensuppe", { category: "suppe-eintopf", prepMinutes: 25 }),
      summary("Hähnchen-Wraps", { prepMinutes: 20 }),
      summary("Überbackener Toast", { prepMinutes: 15, tags: ["ofen"] }),
      summary("Nudelsalat", { category: "salat", prepMinutes: 20 }),
    ];
    for (const recipe of light) expect(suitsDay(recipe, at("dinner", WEDNESDAY))).toBe(true);
  });

  it("has nothing to say about coffee", () => {
    expect(
      suitsDay(summary("torte", { category: "kuchen", prepMinutes: 180 }), at("coffee", WEDNESDAY)),
    ).toBe(true);
  });
});

describe("suggest", () => {
  const cake = summary("kuchen", { category: "kuchen" });
  const supper = summary("wurstsalat", { category: "vesper", proteinType: "red_meat" });
  const salad = summary("tomatensalat", { category: "salat", proteinType: "vegan" });
  const all = [lasagne, salmon, chicken, steak, cake, supper, salad];
  const ids = (list: { recipe: RecipeSummary }[]) => list.map((entry) => entry.recipe.id);

  it("puts the best first", () => {
    const balance = after("vegetarian", "vegetarian", "vegetarian");
    expect(ids(suggest(all, at("lunch"), context({ balance }), 1))).toEqual(["lachs"]);
  });

  it("suggests meals only, a cold supper or a salad only in the evening, and no lasagne then", () => {
    expect(ids(suggest(all, at("lunch"), context(), 10)).sort()).toEqual([
      "huhn",
      "lachs",
      "lasagne",
      "steak",
    ]);
    expect(ids(suggest(all, at("dinner"), context(), 10)).sort()).toEqual([
      "huhn",
      "lachs",
      "steak",
      "tomatensalat",
      "wurstsalat",
    ]);
  });

  it("suggests cakes and desserts for coffee, and for nothing else", () => {
    const dessert = summary("pudding", { category: "dessert" });
    expect(ids(suggest([...all, dessert], at("coffee"), context(), 10)).sort()).toEqual([
      "kuchen",
      "pudding",
    ]);
    // A cake is vegetarian, but it is no answer to a week without vegetarian meals.
    expect(suggest(all, at("coffee"), context(), 1)[0].reasons).toEqual([]);
  });

  it("suggests for a workday only what fits it", () => {
    const roast = summary("braten", { prepMinutes: 150, isFavorite: true });
    expect(ids(suggest([roast, lasagne], at("lunch", WEDNESDAY), context(), 5))).toEqual([
      "lasagne",
    ]);
    expect(ids(suggest([roast, lasagne], at("lunch"), context(), 5))).toEqual([
      "braten",
      "lasagne",
    ]);
  });

  it("never suggests what is on this week's plan already", () => {
    const planned = new Set(["lachs", "lasagne"]);
    expect(ids(suggest(all, at("lunch"), context({ planned }), 10)).sort()).toEqual([
      "huhn",
      "steak",
    ]);
  });

  it("orders equally good recipes by the seed, the same way every time", () => {
    const many = Array.from({ length: 30 }, (_, i) => summary(`r${i}`, { proteinType: "poultry" }));
    const first = ids(suggest(many, at("lunch"), context({ seed: "a" }), 5));
    expect(ids(suggest(many, at("lunch"), context({ seed: "a" }), 5))).toEqual(first);
    expect(ids(suggest(many, at("lunch"), context({ seed: "b" }), 5))).not.toEqual(first);
  });
});

describe("suggestWeek", () => {
  const library = [
    ...Array.from({ length: 12 }, (_, i) => summary(`veggie${i}`)),
    ...Array.from({ length: 6 }, (_, i) => summary(`fisch${i}`, { proteinType: "fish" })),
    ...Array.from({ length: 6 }, (_, i) => summary(`huhn${i}`, { proteinType: "poultry" })),
    ...Array.from({ length: 12 }, (_, i) => summary(`fleisch${i}`, { proteinType: "red_meat" })),
  ];
  const week = ["12", "13", "14", "15", "16", "17", "18"].flatMap((day) => [
    { date: `2026-10-${day}`, meal: "lunch" as const },
    { date: `2026-10-${day}`, meal: "dinner" as const },
  ]);
  const groups = (picks: { suggestion: { recipe: RecipeSummary } }[]) => {
    const tally: Record<string, number> = {};
    for (const pick of picks) {
      const group = groupOf(pick.suggestion.recipe.proteinType) as string;
      tally[group] = (tally[group] ?? 0) + 1;
    }
    return tally;
  };

  it("fills every open meal with a different recipe", () => {
    const picks = suggestWeek(library, week, context());
    expect(picks).toHaveLength(14);
    expect(new Set(picks.map((pick) => pick.suggestion.recipe.id)).size).toBe(14);
    expect(picks.map((pick) => pick.date)).toEqual(week.map((slot) => slot.date));
  });

  it("adds up to a week that meets what the household aims for", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const tally = groups(suggestWeek(library, week, context({ seed })));
      expect(tally.vegetarian, seed).toBeGreaterThanOrEqual(3);
      expect(tally.fish, seed).toBeGreaterThanOrEqual(1);
      expect(tally.red_meat ?? 0, seed).toBeLessThanOrEqual(2);
      expect(tally.poultry ?? 0, seed).toBeLessThanOrEqual(2);
    }
  });

  it("starts from what is planned already", () => {
    const balance = after("red_meat", "red_meat", "fish");
    const open = week.slice(0, 4);
    const picks = suggestWeek(library, open, context({ balance, planned: new Set(["fisch0"]) }));
    expect(groups(picks).red_meat).toBeUndefined();
    expect(groups(picks).vegetarian).toBeGreaterThanOrEqual(3);
    expect(picks.map((pick) => pick.suggestion.recipe.id)).not.toContain("fisch0");
  });

  it("leaves a meal open when the library has nothing left for it", () => {
    expect(suggestWeek([lasagne], week.slice(0, 3), context())).toHaveLength(1);
  });
});
