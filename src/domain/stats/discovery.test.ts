import { describe, expect, it } from "vitest";
import { summary } from "../library/testing";
import type { PlanSlot } from "../plan";
import { discoveryStats } from "./discovery";
import { periodOf } from "./period";

const tags = new Map([
  ["deutsch", { name: "Deutsch", group: "Küche" }],
  ["italienisch", { name: "Italienisch", group: "Küche" }],
  ["asiatisch", { name: "Asiatisch", group: "Küche" }],
  ["pilze", { name: "Pilze", group: "Hauptzutat" }],
]);

const meal = (date: string, recipeId: string): PlanSlot => ({
  id: `${date}-${recipeId}`,
  date,
  meal: "lunch",
  kind: "recipes",
  items: [{ recipeId, servings: 4 }],
});

const book = (count: number, name: string, prefix: string) =>
  Array.from({ length: count }, (_, i) =>
    summary(`${prefix}${i}`, { sourceBook: name, tags: i % 2 ? ["deutsch"] : ["italienisch"] }),
  );

describe("discoveryStats", () => {
  const library = [
    ...book(10, "Omas Küche", "o"),
    summary("curry", { tags: ["asiatisch"], sourceBook: null }),
  ];
  const recipes = new Map(library.map((recipe) => [recipe.id, recipe]));
  // Five new dishes in October, in four weeks in a row; o0 cooked twice; a meal ahead.
  const slots = [
    meal("2026-09-28", "o0"),
    meal("2026-10-05", "o1"),
    meal("2026-10-12", "o2"),
    meal("2026-10-13", "o0"),
    meal("2026-10-19", "o3"),
    meal("2026-10-20", "o4"),
    meal("2026-11-02", "curry"),
  ];
  const october = periodOf("month", "2026-10-15");
  const stats = discoveryStats({ period: october, today: "2026-10-28", slots, recipes, tags });

  it("counts what was cooked for the first time in the period, and of the whole library", () => {
    // The month counts from its first Monday: 28 September belongs to October.
    expect(stats.newDishes).toBe(5);
    expect(stats.everCooked).toBe(5);
    expect(stats.library).toBe(11);
    // Nothing planned ahead counts: the curry's day has not come.
    expect(stats.cuisines).toEqual({ cooked: 2, of: 3 });
  });

  it("awards a badge once it is reached, and says how far the others are", () => {
    const badge = Object.fromEntries(stats.badges.map((entry) => [entry.key, entry]));
    // A calendar month: 28 September is September's, so October has four.
    expect(badge.monat).toMatchObject({ earned: false, detail: "Bisher 4 im Oktober 2026" });
    expect(badge.wochen).toMatchObject({ earned: true, detail: "Längste Folge: 4 Wochen" });
    expect(badge.kuechen).toMatchObject({ earned: false, detail: "2 von 3 Küchen" });
    expect(badge.gerichte).toMatchObject({ earned: false, detail: "5 von 50", progress: 0.1 });
    expect(badge.kochbuch).toMatchObject({ earned: true, detail: "Omas Küche: 5 von 10" });
  });
});
