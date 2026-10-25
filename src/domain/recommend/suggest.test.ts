import { describe, expect, it } from "vitest";
import { summary } from "../library/testing";
import type { RecipeSummary } from "../library/summary";
import { groupOf, weekBalance, withMeal, type BalanceLine } from "./balance";
import type { Meal } from "../plan";
import {
  hintedMeals,
  mixFavorites,
  scoreRecipe,
  suggest,
  suggestWeek,
  suitsDay,
  tagsOfWeek,
  varietyTags,
  type SuggestContext,
} from "./suggest";

const emptyWeek = weekBalance([], () => undefined);

/**
 * A history in which every recipe was last planned five weeks before the test week: neither
 * just had nor long ago, so the history says nothing unless a test sets it.
 */
class CookedAWhileAgo extends Map<string, string> {
  override get(id: string): string {
    return super.get(id) ?? "2026-09-07";
  }
}

const context = (patch: Partial<SuggestContext> = {}): SuggestContext => ({
  balance: emptyWeek,
  planned: new Set(),
  history: new CookedAWhileAgo(),
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

describe("scoreRecipe: season, never cooked and variety", () => {
  const pumpkin = summary("kuerbissuppe", {
    proteinType: "poultry",
    season: { points: 4, fits: true, foods: ["Kürbis", "Lauch", "Karotten"] },
  });
  const strawberries = summary("erdbeertorte", {
    proteinType: "poultry",
    season: { points: 0, fits: false, foods: [], outside: ["Erdbeeren"] },
  });

  it("prefers what is in season and names two of its foods", () => {
    expect(scoreRecipe(pumpkin, context())).toMatchObject({
      score: 2,
      reasons: [{ kind: "in_season", foods: ["Kürbis", "Lauch"] }],
    });
  });

  it("holds back what needs something of a short season outside it", () => {
    expect(scoreRecipe(strawberries, context())).toMatchObject({
      score: -3,
      reasons: [{ kind: "out_of_season", foods: ["Erdbeeren"] }],
    });
  });

  it("says nothing of the season where the page did not work it out", () => {
    expect(scoreRecipe(summary("ohne", { proteinType: "poultry" }), context()).reasons).toEqual([]);
  });

  it("gives a nudge to what was never on a plan", () => {
    expect(
      scoreRecipe(summary("neu", { proteinType: "poultry" }), context({ history: new Map() })),
    ).toMatchObject({
      score: 1,
      reasons: [{ kind: "never_cooked" }],
    });
  });

  const variety = varietyTags([
    {
      name: "Hauptzutat",
      tags: [{ ref: "hackfleisch", name: "Hackfleisch", group: "Hauptzutat" }],
    },
    { name: "Gericht", tags: [{ ref: "pasta", name: "Nudeln", group: "Gericht" }] },
    { name: "Küche", tags: [{ ref: "italienisch", name: "Italienisch", group: "Küche" }] },
  ]);

  it("takes the main ingredient and the kind of dish as what a week should not repeat", () => {
    expect([...variety]).toEqual([
      ["hackfleisch", "Hackfleisch"],
      ["pasta", "Nudeln"],
    ]);
    const week = [
      summary("bolognese", { tags: ["pasta", "hackfleisch", "italienisch", "schnell"] }),
    ];
    expect([...tagsOfWeek(week, variety)]).toEqual(["pasta", "hackfleisch"]);
  });

  it("holds back a second dish with what the week has already", () => {
    const lasagna = summary("lasagne", {
      proteinType: "poultry",
      tags: ["hackfleisch", "italienisch"],
    });
    const usedTags = new Set(["hackfleisch", "pasta"]);
    expect(scoreRecipe(lasagna, context({ variety, usedTags }))).toMatchObject({
      score: -2,
      reasons: [{ kind: "repeats", tag: "Hackfleisch" }],
    });
    // A cuisine may come twice.
    expect(
      scoreRecipe(lasagna, context({ variety, usedTags: new Set(["italienisch"]) })).reasons,
    ).toEqual([]);
  });

  it("names what speaks for a recipe before what speaks against it", () => {
    const usedTags = new Set(["pasta"]);
    const dish = summary("kuerbisnudeln", {
      tags: ["pasta"],
      isFavorite: true,
      season: { points: 3, fits: true, foods: ["Kürbis"] },
    });
    expect(
      scoreRecipe(dish, context({ variety, usedTags })).reasons.map((reason) => reason.kind),
    ).toEqual(["fills_gap", "in_season", "favorite", "repeats"]);
  });
});

describe("mixFavorites", () => {
  const entry = (id: string, isFavorite: boolean, wanted = false) => ({
    recipe: summary(id, { isFavorite, wanted }),
  });

  it("lets favourites take no more than a third of any length of the list", () => {
    const list = [
      entry("f1", true),
      entry("f2", true),
      entry("f3", true),
      entry("o1", false),
      entry("o2", false),
      entry("o3", false),
    ];
    expect(mixFavorites(list).map((e) => e.recipe.id)).toEqual([
      "f1",
      "o1",
      "o2",
      "f2",
      "o3",
      "f3",
    ]);
  });

  it("keeps the order where favourites are no more than their share", () => {
    const list = [entry("o1", false), entry("f1", true), entry("o2", false), entry("o3", false)];
    expect(mixFavorites(list).map((e) => e.recipe.id)).toEqual(["o1", "f1", "o2", "o3"]);
  });

  it("counts a favourite someone wants to cook as a wish", () => {
    const list = [entry("w1", true, true), entry("w2", true, true), entry("o1", false)];
    expect(mixFavorites(list).map((e) => e.recipe.id)).toEqual(["w1", "w2", "o1"]);
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
    // Shown as a steak, but the Spätzle with it make it heavy all the same.
    const steak = summary("Steak mit Pilzen und Spätzle", {
      prepMinutes: 25,
      proteinType: "red_meat",
    });
    for (const recipe of [spaghetti, risotto, tagged, steak]) {
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

  it("lists other recipes between favourites", () => {
    const favourites = Array.from({ length: 6 }, (_, i) =>
      summary(`fav${i}`, { proteinType: "poultry", isFavorite: true }),
    );
    const others = Array.from({ length: 6 }, (_, i) =>
      summary(`neu${i}`, { proteinType: "poultry" }),
    );
    const list = suggest([...favourites, ...others], at("lunch"), context(), 6);
    expect(list.filter((entry) => entry.recipe.isFavorite)).toHaveLength(2);
    expect(list[0].recipe.isFavorite).toBe(true);
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

  it("keeps to the limits when only a few dishes suit a workday evening", () => {
    // As in a small cookbook: pasta and rice for lunch, and only a salad, two fish, three
    // poultry and three meat dishes light and quick enough for a Monday evening. Filled from
    // Monday on, the lunches took the salad and the fish, and a third meat dish was left
    // for Thursday evening.
    const small = [
      ...Array.from({ length: 6 }, (_, i) => summary(`nudeln${i}`, { tags: ["pasta"] })),
      ...Array.from({ length: 4 }, (_, i) => summary(`auflauf${i}`, { prepMinutes: 45 })),
      summary("salat", { category: "salat", prepMinutes: 10 }),
      ...Array.from({ length: 2 }, (_, i) =>
        summary(`fisch${i}`, { proteinType: "fish", prepMinutes: 20 }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        summary(`huhn${i}`, { proteinType: "poultry", prepMinutes: 25 }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        summary(`steak${i}`, { proteinType: "red_meat", prepMinutes: 25 }),
      ),
      summary("wurstsalat", { proteinType: "red_meat", category: "vesper", prepMinutes: 15 }),
      summary("gulasch", { proteinType: "red_meat", tags: ["aufwendig"], prepMinutes: null }),
    ];
    for (let seed = 0; seed < 60; seed++) {
      const picks = suggestWeek(small, week, context({ seed: `s${seed}` }));
      const tally = groups(picks);
      expect(tally.red_meat ?? 0, `seed ${seed}`).toBeLessThanOrEqual(2);
      expect(tally.poultry ?? 0, `seed ${seed}`).toBeLessThanOrEqual(2);
      expect(tally.fish ?? 0, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      // Still in the order of the week.
      expect(picks.map((pick) => `${pick.date}.${pick.meal}`)).toEqual(
        week
          .filter((slot) =>
            picks.some((pick) => pick.date === slot.date && pick.meal === slot.meal),
          )
          .map((slot) => `${slot.date}.${slot.meal}`),
      );
    }
  });

  it("puts a wish on the first meal it suits, before the tightest meals", () => {
    // A quick trout someone wants to cook would also fit a workday evening, where little
    // fits. It stands on Monday lunch all the same, as it is suggested there when asked.
    const wish = summary("forelle", { proteinType: "fish", prepMinutes: 20, wanted: true });
    const picks = suggestWeek([...library, wish], week, context());
    expect(picks[0]).toMatchObject({ date: "2026-10-12", meal: "lunch" });
    expect(picks[0].suggestion.recipe.id).toBe("forelle");
  });

  it("gives each pick the reasons of the week as it is planned", () => {
    const picks = suggestWeek(library, week, context());
    // Chosen one after the other, but every vegetarian pick fills the empty week's gap.
    for (const pick of picks.filter((p) => p.suggestion.recipe.proteinType === "vegetarian")) {
      expect(pick.suggestion.reasons).toEqual([{ kind: "fills_gap", group: "vegetarian" }]);
    }
  });

  it("fills no more than a third of the week with favourites", () => {
    const favourites = library.map((recipe) => ({
      ...recipe,
      id: `fav-${recipe.id}`,
      isFavorite: true,
    }));
    for (const seed of ["a", "b", "c"]) {
      const picks = suggestWeek([...favourites, ...library], week, context({ seed }));
      expect(picks).toHaveLength(14);
      const taken = picks.filter((pick) => pick.suggestion.recipe.isFavorite);
      expect(taken.length, seed).toBe(5);
    }
  });

  it("counts the favourites on the plan already", () => {
    const favourites = library.map((recipe) => ({
      ...recipe,
      id: `fav-${recipe.id}`,
      isFavorite: true,
    }));
    // Two of four meals planned with favourites: a third of the week is two meals.
    const planned = new Set(["fav-veggie0", "fav-veggie1"]);
    const picks = suggestWeek([...favourites, ...library], week.slice(0, 2), context({ planned }));
    expect(picks.filter((pick) => pick.suggestion.recipe.isFavorite)).toEqual([]);
  });

  it("takes a favourite where nothing else suits the meal", () => {
    const only = [summary("lieblingssalat", { category: "salat", isFavorite: true })];
    const picks = suggestWeek([...only, ...library], [at("dinner"), at("lunch")], context());
    expect(picks.map((pick) => pick.suggestion.recipe.id)).toContain("lieblingssalat");
  });

  it("does not give the week the same main ingredient twice when there is a choice", () => {
    const variety = new Map([["hackfleisch", "Hackfleisch"]]);
    const mince = Array.from({ length: 6 }, (_, i) =>
      summary(`hack${i}`, { tags: ["hackfleisch"], proteinType: "red_meat" }),
    );
    const beef = Array.from({ length: 6 }, (_, i) =>
      summary(`rind${i}`, { proteinType: "red_meat" }),
    );
    // A week that wants two red meat dishes and nothing else.
    const balance = after("vegetarian", "vegetarian", "vegetarian", "fish");
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const picks = suggestWeek([...mince, ...beef], week.slice(0, 2), {
        ...context({ seed, balance, variety, usedTags: new Set() }),
      });
      const withMince = picks.filter((pick) => pick.suggestion.recipe.tags.includes("hackfleisch"));
      expect(withMince.length, seed).toBeLessThanOrEqual(1);
    }
  });

  it("leaves a meal open when the library has nothing left for it", () => {
    expect(suggestWeek([lasagne], week.slice(0, 3), context())).toHaveLength(1);
  });
});

describe("hintedMeals", () => {
  const pick = (day: string, score: number, isFavorite = false) => ({
    date: `2026-10-${day}`,
    meal: "lunch" as const,
    suggestion: { recipe: summary(`r${day}`, { isFavorite }), score, reasons: [] },
  });

  it("offers the five with the most to say for them, never one with little", () => {
    const picks = ["12", "13", "14", "15", "16", "17", "18"].map((day, i) => pick(day, 9 - i));
    const hinted = hintedMeals([...picks, pick("19", 1)], "w");
    expect([...hinted].sort()).toEqual([
      "2026-10-12.lunch",
      "2026-10-13.lunch",
      "2026-10-14.lunch",
      "2026-10-15.lunch",
      "2026-10-16.lunch",
    ]);
  });

  it("offers no more than two favourites", () => {
    const favourites = ["12", "13", "14", "15"].map((day) => pick(day, 5, true));
    const others = ["16", "17", "18"].map((day) => pick(day, 3));
    const hinted = hintedMeals([...favourites, ...others], "w");
    expect(hinted.size).toBe(5);
    expect(
      ["12", "13", "14", "15"].filter((day) => hinted.has(`2026-10-${day}.lunch`)),
    ).toHaveLength(2);
  });
});
