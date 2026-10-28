import { describe, expect, it } from "vitest";
import { SKIP_DAYS, stackOf, stackWhy } from "./stack";
import { summary } from "./testing";

const today = "2026-10-28";
const old = { addedOn: "2026-01-05" };

describe("stackOf", () => {
  const recipes = [
    summary("new", old),
    summary("cooked", old),
    summary("fav", { ...old, isFavorite: true }),
    summary("wish", { ...old, wanted: true }),
    summary("cake", { ...old, category: "kuchen" }),
    summary("asideLately", old),
    summary("asideLongAgo", old),
  ];
  const history = new Map([["cooked", "2026-09-01"]]);
  const skipped = new Map([
    ["asideLately", "2026-10-20"],
    ["asideLongAgo", "2026-09-01"],
  ]);

  it("holds meals no plan held and nobody marked, without those put aside lately", () => {
    const stack = stackOf(recipes, { today, history, skipped }).map((r) => r.id);
    expect(stack.sort()).toEqual(["asideLongAgo", "new"]);
  });

  it("holds one category where one is chosen, cakes included", () => {
    expect(
      stackOf(recipes, { today, history, skipped, category: "kuchen" }).map((r) => r.id),
    ).toEqual(["cake"]);
  });

  it("lets a recipe put aside come back after four weeks", () => {
    const back = new Map([["new", "2026-09-30"]]);
    expect(SKIP_DAYS).toBe(28);
    expect(stackOf([summary("new", old)], { today, history, skipped: back })).toHaveLength(1);
    const soon = new Map([["new", "2026-10-01"]]);
    expect(stackOf([summary("new", old)], { today, history, skipped: soon })).toHaveLength(0);
  });

  it("shuffles by the day", () => {
    const many = Array.from({ length: 12 }, (_, i) => summary(`r${i}`, old));
    const order = (day: string) =>
      stackOf(many, { today: day, history, skipped: new Map() })
        .map((r) => r.id)
        .join();
    expect(order("2026-10-28")).toBe(order("2026-10-28"));
    expect(order("2026-10-28")).not.toBe(order("2026-10-29"));
  });
});

describe("stackWhy", () => {
  it("names the season first, then a recipe that is new", () => {
    const fits = { points: 3, fits: true, foods: ["Kürbis", "Lauch"] };
    expect(stackWhy(summary("a", { ...old, season: fits }), today)).toBe(
      "Passt zur Saison: Kürbis, Lauch",
    );
    expect(stackWhy(summary("b", { addedOn: "2026-10-20" }), today)).toBe("Neu im Kochbuch");
    expect(stackWhy(summary("c", old), today)).toBeNull();
  });
});
