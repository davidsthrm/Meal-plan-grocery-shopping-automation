import { describe, expect, it } from "vitest";
import { seedCatalog } from "../../../supabase/seed/catalog";
import { createCatalogIndex, type Shop } from "../catalog";
import type { PlanSlot } from "../plan";
import type { Recipe } from "../recipe";
import { buildShoppingList, moveKey } from "./build";
import {
  canMoveTo,
  decisionOf,
  leavesNote,
  movedAway,
  moveDays,
  moveStartDay,
  nextMoveDay,
  plannedOf,
} from "./decisions";
import { guessKind } from "./free-entry";
import { presentByAisle } from "./present";
import { itemKey, shopChoices, suggestShops } from "./shop-choice";
import { sectionsByShop } from "./supermarkets";
import { line, testIndex } from "./test-catalog";
import { enqueue, shownDecision, type Tick } from "./ticks";
import { DEFAULT_SHOPPING_DAYS, noteId, tripsBetween, type ShoppingTrip } from "./trips";
import type { LineState, ManualEntry, ShoppingLine } from "./types";
import { completion, notesOfWeek } from "./week-notes";

/**
 * The Monday errand of 19 October 2026, as it went: eggs sold out and bought on Tuesday at
 * Dilgers Hof, three of six bottles of Ensinger Sport, the ginger shots not needed after
 * all. The note must close, and the eggs must be on a note of Tuesday.
 */

const MONDAY = "2026-10-19";
const TUESDAY = "2026-10-20";
const FRIDAY = "2026-10-23";
const monday: ShoppingTrip = { date: MONDAY, place: "supermarket" };
const tuesday: ShoppingTrip = { date: TUESDAY, place: "supermarket" };
const friday: ShoppingTrip = { date: FRIDAY, place: "supermarket" };

const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-10-12", "2026-11-01");

const omelette: Recipe = {
  id: "omelett",
  title: "Omelett",
  kind: "cookbook",
  servings: { min: 4, max: 4, unit: null },
  ingredients: [line("eier", 4, "Stück"), line("milch", 100, "ml")],
};

const dinner = (date: string): PlanSlot => ({
  id: `${date}-omelett`,
  date,
  meal: "dinner",
  kind: "recipes",
  items: [{ recipeId: "omelett", servings: 4 }],
});

const typed = (id: string, text: string): ManualEntry => ({
  id,
  text,
  shoppingDate: MONDAY,
  place: "supermarket",
});

function build(
  slots: PlanSlot[],
  options: { moves?: Map<string, ShoppingTrip>; entries?: ManualEntry[] } = {},
): ShoppingLine[] {
  return buildShoppingList({
    index: testIndex,
    recipes: [omelette],
    slots,
    trips,
    manualEntries: options.entries ?? [],
    moves: options.moves,
  });
}

const on = (lines: readonly ShoppingLine[], note: ShoppingTrip) =>
  lines.filter(
    (entry) => noteId({ date: entry.shoppingDate, place: entry.place }) === noteId(note),
  );

const viewOf = (lines: readonly ShoppingLine[], note: ShoppingTrip, states = {}) =>
  presentByAisle(on(lines, note), states, testIndex);

const toBuy = (view: ReturnType<typeof viewOf>) => view.groups.flatMap((group) => group.lines);

const at = (time: string) => Date.parse(`${MONDAY}T${time}:00Z`);

describe("the Monday errand", () => {
  const entries = [typed("shots", "4 Ingwer-Shots"), typed("wasser", "6 Ensinger Sport")];
  const lines = build([dinner(MONDAY)], { entries });
  const states: Record<string, LineState> = {
    "eier@main": { checked: true, decidedAt: at("10:01") },
    "milch@main": { checked: true, decidedAt: at("10:02") },
    "manual:shots": { removed: true, decidedAt: at("10:03"), decidedBy: "david" },
    "manual:wasser": {
      checked: true,
      bought: { name: null, amount: { quantity: 3, unit: "Stück" } },
      remainder: { kind: "discarded" },
      decidedAt: at("10:04"),
    },
  };
  const ticks = (key: string) => {
    const state = states[key];
    return state?.checked ? { at: state.decidedAt as number, by: null } : undefined;
  };

  it("lists what was not bought on purpose: the removed shots and the rest of the water", () => {
    const view = viewOf(lines, monday, states);
    expect(view.notBought.map((entry) => [entry.view.line.label, entry.amount])).toEqual([
      ["Ensinger Sport", { quantity: 3, unit: "Stück" }],
      ["Ingwer-Shots", { quantity: 4, unit: "Stück" }],
    ]);
    expect(toBuy(view).map((entry) => entry.line.label)).not.toContain("Ingwer-Shots");
  });

  it("shows the water as bought in part, and the shots as removed", () => {
    const view = viewOf(lines, monday, states);
    const water = toBuy(view).find((entry) => entry.line.key === "manual:wasser");
    expect(water).toMatchObject({ status: "partially_bought", checked: true });
    expect(view.notBought[1].view).toMatchObject({ status: "removed" });
  });

  it("is done once nothing is open, and the last purchase says when", () => {
    const view = viewOf(lines, monday, states);
    expect(completion(toBuy(view), ticks)).toEqual({ at: at("10:04"), by: null });
  });

  it("opens again when a removed line is opened again", () => {
    const reopened = { ...states, "manual:shots": {} };
    const view = viewOf(lines, monday, reopened);
    expect(view.notBought).toHaveLength(1);
    expect(completion(toBuy(view), ticks)).toBeNull();
  });

  it("is not done when everything on it was removed and nothing bought", () => {
    // Nobody went shopping: the lines were taken off while the week was planned.
    const view = viewOf(build([], { entries: [typed("shots", "Ingwer-Shots")] }), monday, {
      "manual:shots": { removed: true },
    });
    expect(toBuy(view)).toEqual([]);
    expect(completion(toBuy(view), ticks)).toBeNull();
  });

  it("does not count what is still open as done", () => {
    const view = viewOf(lines, monday, { ...states, "eier@main": {} });
    expect(completion(toBuy(view), ticks)).toBeNull();
  });
});

describe("moving a line to another day", () => {
  const moves = new Map([[moveKey(monday, "eier@main"), tuesday]]);
  const lines = build([dinner(MONDAY)], { moves });

  it("puts the eggs on a note of Tuesday, which the week then shows", () => {
    expect(on(lines, tuesday).map((entry) => entry.key)).toEqual(["eier@main"]);
    expect(on(lines, monday).map((entry) => entry.key)).toEqual(["milch@main"]);
    expect(notesOfWeek(lines, trips, MONDAY).map(noteId)).toContain(noteId(tuesday));
  });

  it("keeps them in the section of the farm shop they are bought at", () => {
    const aldi = { ...testIndex.shopById.get("aldi")!, supermarketRank: 1 };
    const dilgers: Shop = {
      id: "dilgers",
      name: "Dilgers Hof",
      shortLabel: "Dilgers",
      sortOrder: 9,
      aisleSortOverrides: {},
      supermarketRank: 2,
      aisleGroupIds: ["molkerei"],
    };
    const sections = sectionsByShop(viewOf(lines, tuesday), [aldi, dilgers]);
    expect(
      sections.map((section) => [
        section.shop?.name,
        section.groups.flatMap((group) => group.lines.map((entry) => entry.line.label)),
      ]),
    ).toEqual([["Dilgers Hof", ["Eier"]]]);
  });

  it("says on Monday's note where they went", () => {
    expect(movedAway(monday, lines).map((each) => [each.line.label, noteId(each.to)])).toEqual([
      ["Eier", noteId(tuesday)],
    ]);
    expect(movedAway(tuesday, lines)).toEqual([]);
  });

  it("adds them up with what a day that has a note already buys", () => {
    const toFriday = new Map([[moveKey(monday, "eier@main"), friday]]);
    // Friday's omelette was planned after Monday's errand: Friday buys its eggs.
    const later: PlanSlot = {
      id: `${FRIDAY}-omelett`,
      date: FRIDAY,
      meal: "dinner",
      kind: "recipes",
      items: [{ recipeId: "omelett", servings: 4, plannedOn: TUESDAY }],
    };
    const both = build([dinner(MONDAY), later], { moves: toFriday });
    const eggs = on(both, friday).filter((entry) => entry.ingredientId === "eier");
    expect(eggs).toHaveLength(1);
    expect(eggs[0].amounts).toEqual([{ quantity: 8, unit: "Stück" }]);
    expect(eggs[0].contributions.map((part) => part.origin && noteId(part.origin))).toEqual([
      noteId(monday),
      noteId(friday),
    ]);
  });

  it("offers the days from today up to a week after the note, whatever the plan needs", () => {
    expect(moveDays(MONDAY, MONDAY)).toEqual([
      MONDAY,
      TUESDAY,
      "2026-10-21",
      "2026-10-22",
      FRIDAY,
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
    expect(canMoveTo(noteId(tuesday), monday, MONDAY)).toEqual(tuesday);
    // Another shop on the same day, today.
    expect(canMoveTo("2026-10-19.bakery", monday, MONDAY)).toEqual({
      date: MONDAY,
      place: "bakery",
    });
    expect(canMoveTo("2026-10-18.supermarket", monday, MONDAY)).toBeNull();
    expect(canMoveTo("2026-10-27.supermarket", monday, MONDAY)).toBeNull();
    expect(canMoveTo("2026-10-20.drugstore", monday, MONDAY)).toBeNull();
  });

  it("brings a line forward from a later note, down to today", () => {
    const friday: ShoppingTrip = { date: FRIDAY, place: "supermarket" };
    // Toilet paper on Friday's note bought on Monday, the main errand.
    expect(canMoveTo(noteId(monday), friday, MONDAY)).toEqual(monday);
    expect(moveDays(FRIDAY, MONDAY)[0]).toBe(MONDAY);
    // A note further ahead offers the week before it, not every day until then.
    expect(moveDays("2027-03-01", MONDAY)[0]).toBe("2027-02-22");
    expect(canMoveTo("2027-03-08.market", { date: "2027-03-01", place: "market" }, MONDAY)).toEqual(
      { date: "2027-03-08", place: "market" },
    );
    expect(canMoveTo(`${MONDAY}.market`, { date: "2027-03-01", place: "market" }, MONDAY)).toBe(
      null,
    );
  });

  it("offers today and the week after for a note whose day is over", () => {
    expect(moveDays("2026-10-16", MONDAY)[0]).toBe(MONDAY);
    // Up to a week after the note: Friday's note reaches the next Friday.
    expect(moveDays("2026-10-16", MONDAY).at(-1)).toBe(FRIDAY);
    // Long over, it still offers two days.
    expect(moveDays("2026-10-01", MONDAY)).toEqual([MONDAY, TUESDAY]);
    expect(nextMoveDay("2026-10-16", MONDAY)).toBe(TUESDAY);
    expect(nextMoveDay(MONDAY, MONDAY)).toBe(TUESDAY);
  });

  it("starts on a day the move is taken for", () => {
    // Another shop on the note's own day.
    expect(moveStartDay(MONDAY, MONDAY)).toBe(MONDAY);
    expect(moveStartDay(FRIDAY, MONDAY)).toBe(FRIDAY);
    // Friday's butcher note looked at on Monday: today, not Friday, which is over.
    const butcher = { date: "2026-10-16", place: "butcher" } as const;
    const start = moveStartDay(butcher.date, MONDAY);
    expect(start).toBe(MONDAY);
    expect(canMoveTo(`${start}.supermarket`, butcher, MONDAY)).toEqual(monday);
    expect(canMoveTo("2026-10-16.supermarket", butcher, MONDAY)).toBeNull();
  });
});

describe("the rest of a line bought in part", () => {
  const rest: ManualEntry = {
    id: "rest",
    text: "Eier",
    shoppingDate: TUESDAY,
    place: "supermarket",
    carried: { ingredientId: "eier", amount: { quantity: 2, unit: "Stück" }, from: monday },
  };

  it("is bought on the note it was moved to, with its own amount", () => {
    const lines = build([], { entries: [rest] });
    expect(on(lines, tuesday)).toMatchObject([
      { key: "eier@main", amounts: [{ quantity: 2, unit: "Stück" }] },
    ]);
  });

  it("adds up with what that note buys of the same", () => {
    const lines = build([dinner(TUESDAY)], { entries: [rest] });
    const eggs = on(lines, monday).filter((entry) => entry.ingredientId === "eier");
    // Tuesday's omelette is bought on Monday; the rest is bought on Tuesday, as moved.
    expect(eggs[0].amounts).toEqual([{ quantity: 4, unit: "Stück" }]);
    expect(on(lines, tuesday)[0].contributions[0].source).toEqual({
      type: "manual",
      entryId: "rest",
      from: monday,
    });
  });

  it("is not counted as not bought where it was moved", () => {
    const lines = build([dinner(MONDAY)]);
    const view = viewOf(lines, monday, {
      "eier@main": {
        checked: true,
        bought: { name: null, amount: { quantity: 2, unit: "Stück" } },
        remainder: { kind: "moved", to: tuesday },
      },
    });
    expect(view.notBought).toEqual([]);
  });
});

describe("a substitute", () => {
  it("keeps the plan next to what was bought", () => {
    const lines = build([dinner(MONDAY)]);
    const view = viewOf(lines, monday, {
      "milch@main": { checked: true, bought: { name: "Hafermilch", amount: null } },
    });
    const milk = toBuy(view).find((entry) => entry.line.key === "milch@main")!;
    expect(milk.bought).toEqual({ name: "Hafermilch", amount: null });
    expect(plannedOf(milk, monday)).toMatchObject({ name: "Milch", date: MONDAY });
    expect(decisionOf(milk)).toEqual({ kind: "bought", amount: null, name: "Hafermilch" });
  });
});

describe("shops to offer", () => {
  const aldi: Shop = {
    id: "aldi",
    name: "Aldi",
    shortLabel: "Aldi",
    sortOrder: 1,
    aisleSortOverrides: {},
    supermarketRank: 1,
    foundNear: "88471",
    // Bought there on purpose: frozen food. Aldi still sells everything.
    aisleGroupIds: ["tk"],
  };
  const dilgers: Shop = {
    id: "dilgers",
    name: "Dilgers Hof",
    shortLabel: "Dilgers",
    sortOrder: 9,
    aisleSortOverrides: {},
    supermarketRank: 2,
    aisleGroupIds: ["eier", "molkerei", "obst"],
  };
  const index = createCatalogIndex({
    ...seedCatalog,
    shops: [aldi, ...seedCatalog.shops.filter((shop) => shop.id !== "aldi"), dilgers],
  });
  const choices = shopChoices(index, [aldi, dilgers]);
  const names = (list: readonly { name: string }[]) => list.map((choice) => choice.name);
  const item = (id: string) => index.ingredientById.get(id)!;

  it("offers everything the household shops at once each", () => {
    expect(names(choices)).toEqual(["Aldi", "Dilgers Hof", "Metzger", "Bäcker", "Markt"]);
  });

  it("never offers the Bäcker for grapes", () => {
    const { suggested, others } = suggestShops(item("weintrauben"), choices, [], index);
    expect(names(suggested)).toEqual(["Aldi", "Dilgers Hof", "Markt"]);
    // Not even under "Alle Geschäfte": neither sells grapes.
    expect(names(others)).toEqual([]);
  });

  it("offers the Bäcker and the supermarket for pretzels, not the Metzger", () => {
    const { suggested, others } = suggestShops(item("brezeln"), choices, [], index);
    expect(names(suggested)).toEqual(["Aldi", "Bäcker"]);
    expect(names(others)).not.toContain("Metzger");
    expect(names(others)).toEqual(["Dilgers Hof", "Markt"]);
  });

  it("offers first where it was bought before, also a shop that does not sell its kind", () => {
    const past = [
      { choice: "baecker", times: 1, lastAt: 1 },
      { choice: "metzger", times: 3, lastAt: 0 },
    ];
    const { suggested, others } = suggestShops(item("brezeln"), choices, past, index);
    expect(names(suggested)).toEqual(["Metzger", "Bäcker", "Aldi"]);
    expect(names(others)).not.toContain("Metzger");
  });

  it("knows an item by its ingredient, or by its text", () => {
    expect(itemKey({ ingredientId: "brezeln", label: "Brezeln" })).toBe("brezeln");
    expect(itemKey({ ingredientId: null, label: "Ingwer-Shots" })).toBe("text:ingwershots");
  });
});

describe("guessKind", () => {
  const index = createCatalogIndex(seedCatalog);
  const kindOf = (id: string) => index.ingredientById.get(id)!.aisleGroupId;

  it("reads what a compound is from its end", () => {
    expect(guessKind("Bio-Vollmilch laktosefrei", index)).toBe(null);
    expect(guessKind("Bio-Heumilch", index)).toBe(kindOf("milch"));
    expect(guessKind("2 Dinkelnudeln", index)).toBe(kindOf("nudeln"));
  });

  it("leaves what it cannot tell unsorted: ginger shots are no ginger", () => {
    expect(guessKind("4 Ingwer-Shots", index)).toBeNull();
    expect(guessKind("Geschenkpapier", index)).toBeNull();
  });
});

describe("undo", () => {
  const note = noteId(monday);
  const page = { decision: { kind: "open" as const }, renderedAt: at("10:00") };
  const made = (id: string, decision: Tick["decision"], time: string): Tick => ({
    id,
    note,
    key: "manual:shots",
    checked: false,
    decision,
    at: at(time),
    sentAt: null,
  });

  it("is a later decision that gives back the one before", () => {
    let ticks = enqueue([], made("t1", { kind: "removed" }, "10:03"));
    const line = { note, key: "manual:shots" };
    expect(shownDecision(ticks, line, page)).toEqual({ kind: "removed" });
    ticks = enqueue(ticks, made("t2", page.decision, "10:04"));
    expect(shownDecision(ticks, line, page)).toEqual({ kind: "open" });
    // One word per line waits: the removal is not sent after its undo.
    expect(ticks.map((tick) => tick.id)).toEqual(["t2"]);
  });
});

describe("leavesNote", () => {
  it("keeps a line moved to another shop of the same note on it", () => {
    const here = "2026-10-28.supermarket";
    expect(leavesNote({ kind: "moved", to: here, shopId: "aldi" }, here)).toBe(false);
    expect(leavesNote({ kind: "moved", to: "2026-10-30.supermarket", shopId: null }, here)).toBe(
      true,
    );
    expect(leavesNote({ kind: "moved", to: "2026-10-28.market", shopId: null }, here)).toBe(true);
    expect(leavesNote({ kind: "removed" }, here)).toBe(true);
    expect(leavesNote({ kind: "bought" }, here)).toBe(false);
  });
});
