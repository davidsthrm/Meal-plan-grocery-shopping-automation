import { describe, expect, it } from "vitest";
import type { PlanExtra, PlanSlot } from "../plan";
import type { Recipe } from "../recipe";
import { buildShoppingList } from "./build";
import { resolveLine } from "./present";
import { line, testIndex } from "./test-catalog";
import { DEFAULT_SHOPPING_DAYS, noteId, tripsBetween } from "./trips";
import { completion, extrasToBuy, notesOf, notesOfWeek } from "./week-notes";

const SAT_BEFORE = "2026-10-10";
const MONDAY = "2026-10-12";
const WEDNESDAY = "2026-10-14";
const FRIDAY = "2026-10-16";
const SATURDAY = "2026-10-17";
const SUNDAY = "2026-10-18";

const recipe = (id: string, ...ingredients: Recipe["ingredients"]): Recipe => ({
  id,
  title: id,
  kind: "cookbook",
  servings: { min: 4, max: 4, unit: null },
  ingredients,
});
const dinner = (date: string, recipeId: string): PlanSlot => ({
  id: `${date}-${recipeId}`,
  date,
  meal: "dinner",
  kind: "recipes",
  items: [{ recipeId, servings: 4 }],
});
const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-09-28", "2026-10-25");
const build = (recipes: Recipe[], slots: PlanSlot[]) =>
  buildShoppingList({ index: testIndex, recipes, slots, trips });

describe("extrasToBuy", () => {
  const extra = (recipeId: string, date: string | null = null): PlanExtra => ({
    recipeId,
    servings: 4,
    note: null,
    date,
  });

  it("takes every extra of the week, and of the weeks around those for a day", () => {
    const chosen = extrasToBuy({
      before: [extra("cake-sunday", "2026-10-11"), extra("cake-any")],
      week: [extra("cake-week"), extra("cake-friday", FRIDAY)],
      after: [extra("cake-monday", "2026-10-19"), extra("cake-later")],
    });
    expect(chosen.map((each) => each.recipeId)).toEqual([
      "cake-sunday",
      "cake-week",
      "cake-friday",
      "cake-monday",
    ]);
  });
});

describe("notesOfWeek", () => {
  it("shows the household's errands of the week in order, empty ones too", () => {
    const shown = notesOfWeek([], trips, MONDAY).map(noteId);
    expect(shown).toEqual([`${MONDAY}.supermarket`, `${FRIDAY}.supermarket`, `${SATURDAY}.market`]);
  });

  it("shows an errand before the week that buys for it, and none that does not", () => {
    const veg = recipe("gemuese", line("karotten", 4, "Stück"));
    // Saturday's market buys the carrots of Monday and of the Sunday before.
    const lines = build([veg], [dinner("2026-10-11", "gemuese"), dinner(MONDAY, "gemuese")]);
    expect(notesOfWeek(lines, trips, MONDAY).map(noteId)).toContain(`${SAT_BEFORE}.market`);
    const lastWeekOnly = build([veg], [dinner("2026-10-11", "gemuese")]);
    expect(notesOfWeek(lastWeekOnly, trips, MONDAY).map(noteId)).not.toContain(
      `${SAT_BEFORE}.market`,
    );
  });

  it("shows a day of the week something is bought on besides the shopping days", () => {
    const steak = recipe("steak", line("steak", 4, "Stück"));
    // Without butcher days the butcher is gone to on the day of each meal.
    const lines = build([steak], [dinner(WEDNESDAY, "steak")]);
    const shown = notesOfWeek(lines, trips, MONDAY).map(noteId);
    expect(shown).toContain(`${WEDNESDAY}.butcher`);
    expect(shown.indexOf(`${WEDNESDAY}.butcher`)).toBe(1);
  });

  it("puts the notes of one day in the order of the places", () => {
    const steak = recipe("steak", line("steak", 4, "Stück"), line("sahne", 200, "ml"));
    const monday = notesOfWeek(build([steak], [dinner(MONDAY, "steak")]), trips, MONDAY).filter(
      (trip) => trip.date === MONDAY,
    );
    expect(monday.map((trip) => trip.place)).toEqual(["supermarket", "butcher"]);
  });

  it("leaves out what is bought in the week after", () => {
    const lines = build([recipe("suppe", line("sahne", 200, "ml"))], [dinner(SUNDAY, "suppe")]);
    const nextMonday = build(
      [recipe("suppe", line("sahne", 200, "ml"))],
      [dinner("2026-10-19", "suppe")],
    );
    expect(notesOfWeek([...lines, ...nextMonday], trips, MONDAY).map(noteId)).not.toContain(
      "2026-10-19.supermarket",
    );
  });
});

describe("notesOf", () => {
  it("names every note lines are on, once", () => {
    const soup = recipe("suppe", line("sahne", 200, "ml"), line("milch", 500, "ml"));
    const lines = build([soup], [dinner(MONDAY, "suppe"), dinner(SATURDAY, "suppe")]);
    expect(notesOf(lines).map(noteId)).toEqual([`${MONDAY}.supermarket`, `${FRIDAY}.supermarket`]);
  });
});

describe("completion", () => {
  const lines = build(
    [recipe("suppe", line("sahne", 200, "ml"), line("milch", 500, "ml"))],
    [dinner(MONDAY, "suppe")],
  ).filter((entry) => entry.place === "supermarket");
  const ticks = new Map([
    ["sahne@main", { at: 1000, by: "lena" }],
    ["milch@main", { at: 2000, by: "david" }],
  ]);

  it("is done when every line is ticked, by whoever made the last tick", () => {
    const ticked = lines.map((entry) => resolveLine(entry, { checked: true }));
    expect(completion(ticked, (key) => ticks.get(key))).toEqual({ at: 2000, by: "david" });
  });

  it("stays done when what is open was planned after the last tick", () => {
    const planned = (at: number) =>
      lines.map((entry) => ({
        ...entry,
        contributions: entry.contributions.map((part) => ({ ...part, plannedAt: at })),
      }));
    const cream = (at: number) => [
      resolveLine(planned(500)[1], { checked: true }),
      resolveLine(planned(at)[0], { checked: false }),
    ];
    expect(completion(cream(3000), (key) => ticks.get(key))).toEqual({ at: 2000, by: "david" });
    // Planned before the shopping, or at a moment nobody knows: still to buy.
    expect(completion(cream(1500), (key) => ticks.get(key))).toBeNull();
    expect(
      completion([resolveLine(lines[0]), resolveLine(lines[1], { checked: true })], (key) =>
        ticks.get(key),
      ),
    ).toBeNull();
  });

  it("is not done while a line is open, nor with nothing to buy", () => {
    const one = lines.map((entry, at) => resolveLine(entry, { checked: at === 0 }));
    expect(completion(one, (key) => ticks.get(key))).toBeNull();
    expect(completion([], (key) => ticks.get(key))).toBeNull();
  });
});
