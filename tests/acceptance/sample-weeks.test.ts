import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "@/domain/catalog";
import { addDays, type IsoDate } from "@/domain/dates";
import type { PlanExtra, PlanSlot } from "@/domain/plan";
import { groupAtHome } from "@/domain/shopping-list/at-home";
import { buildShoppingList, moveKey, type BuildInput } from "@/domain/shopping-list/build";
import { dayProblems, moveTargets } from "@/domain/shopping-list/change-day";
import { presentByAisle } from "@/domain/shopping-list/present";
import {
  butcherWeekdays,
  DEFAULT_SHOPPING_DAYS,
  noteId,
  singleTrip,
  tripsBetween,
  type ShoppingTrip,
} from "@/domain/shopping-list/trips";
import type { Contribution, ShoppingLine } from "@/domain/shopping-list/types";
import { notesOf } from "@/domain/shopping-list/week-notes";
import { seedCatalog } from "../../supabase/seed/catalog";
import { seedRecipes } from "../../supabase/seed/recipes";
import inputs from "../fixtures/sample-week/inputs.json";
import { planSlots } from "./sample-week";

/**
 * Whole weeks on the household's real errands: supermarket on Monday and Friday, the market
 * on Saturday, the butcher on those days and the bakery for a meal. Built with the real
 * catalog and the household's sample recipes, and held against what must be true of any
 * week: nothing is lost or bought twice, nothing is bought too late or kept too long, and
 * the check for another day agrees with how the notes were worked out.
 */

const index = createCatalogIndex(seedCatalog);
const MONDAY = "2026-10-12";
const TODAY = "2026-10-10";
const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-09-28", "2026-10-25");
const butcherDays = butcherWeekdays(DEFAULT_SHOPPING_DAYS);
const day = (offset: number): IsoDate => addDays(MONDAY, offset);

type Week = Pick<BuildInput, "slots" | "extras" | "manualEntries" | "moves" | "doneAt">;

// As the app reads a week: what has no day of its own is bought on its first supermarket day.
const onErrands = (week: Week) =>
  buildShoppingList({
    index,
    recipes: seedRecipes,
    trips,
    butcherDays,
    extrasDate: MONDAY,
    ...week,
  });

/** The same week bought in one go on Monday, as the handwritten list was. */
const inOneGo = (week: Week) =>
  buildShoppingList({
    index,
    recipes: seedRecipes,
    ...week,
    moves: undefined,
    doneAt: undefined,
    trips: singleTrip(MONDAY),
    onDemand: [],
  });

/** One reason something is bought, wherever it ends up. */
function reason({ source, originalText, amount }: Contribution): string {
  const from =
    source.type === "manual"
      ? source.entryId
      : source.type === "extra"
        ? `extra:${source.recipeId}`
        : `${source.slotId}:${source.type === "recipe" ? source.recipeId : "food"}`;
  return `${from}|${originalText}|${amount ? `${amount.quantity} ${amount.unit}` : "-"}`;
}

const reasons = (lines: readonly ShoppingLine[]) =>
  lines.flatMap((line) => line.contributions.map(reason)).sort();

/** The exact sums of a week per ingredient and unit, over all its notes. */
function sums(lines: readonly ShoppingLine[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const line of lines) {
    for (const amount of line.amounts) {
      const key = `${line.ingredientId ?? line.label}|${amount.unit}`;
      total[key] = Math.round(((total[key] ?? 0) + amount.quantity) * 1000) / 1000;
    }
  }
  return total;
}

const linesOn = (lines: readonly ShoppingLine[], trip: ShoppingTrip) =>
  lines.filter((line) => noteId({ date: line.shoppingDate, place: line.place }) === noteId(trip));

/** What must hold for any week on errands. */
function expectSound(week: Week) {
  const lines = onErrands(week);
  // Every reason to buy something is on exactly one note, and amounts are only spread out,
  // not changed.
  expect(reasons(lines)).toEqual(reasons(inOneGo(week)));
  const spread = sums(lines);
  const once = sums(inOneGo(week));
  // A sum that is split over several notes is the same in total, up to rounding.
  expect(Object.keys(spread).sort()).toEqual(Object.keys(once).sort());
  for (const key of Object.keys(once)) expect(spread[key]).toBeCloseTo(once[key], 6);
  // Every note can be done on its own day, as the check for another day sees it: in time
  // for its meals, a lunch on a working day included, and kept until then.
  for (const trip of notesOf(lines)) {
    expect({
      note: noteId(trip),
      problems: dayProblems(linesOn(lines, trip), trip, TODAY, index),
    }).toEqual({ note: noteId(trip), problems: [] });
  }
  // A key is unique on its note.
  for (const trip of notesOf(lines)) {
    const keys = linesOn(lines, trip).map((line) => line.key);
    expect(new Set(keys).size).toBe(keys.length);
  }
  return lines;
}

/** A meal of recipes, cooked for the household. */
const meal = (
  date: IsoDate,
  time: "lunch" | "dinner",
  recipeId: string,
  extra?: number,
): PlanSlot => ({
  id: `${date}-${time}`,
  date,
  meal: time,
  kind: "recipes",
  items: [{ recipeId, servings: inputs.householdServings }],
  extra,
});

/**
 * A week of the household's five sample recipes: lunches on working days, a steak on
 * Sunday, a cold supper with bread from the bakery, more cooked for leftovers, and the
 * extras of a week with and without a day.
 */
const fullWeek: Week = {
  slots: [
    meal(day(0), "dinner", "kartoffel-avocado-suppe"),
    meal(day(1), "lunch", "linsen-eintopf", 2),
    { id: `${day(2)}-lunch`, date: day(2), meal: "lunch", kind: "leftovers", ofSlotId: null },
    meal(day(2), "dinner", "rustikaler-linsen-salat"),
    meal(day(3), "lunch", "avocado-spaghetti"),
    {
      id: `${day(4)}-dinner`,
      date: day(4),
      meal: "dinner",
      kind: "free_text",
      label: "Vesper",
      foods: [
        { label: "Brot", ingredientId: "brot", shopId: "baecker" },
        { label: "Gurke", ingredientId: "gurken", shopId: null },
      ],
    },
    meal(day(5), "lunch", "kartoffel-avocado-suppe"),
    meal(day(6), "lunch", "steak-pfefferrahm-spaetzle", 2),
  ],
  extras: [
    { recipeId: "avocado-spaghetti", servings: 4, note: "Für Oma", date: day(2) },
    { recipeId: "rustikaler-linsen-salat", servings: 4, note: null },
  ] satisfies PlanExtra[],
  manualEntries: [
    { id: "milch", text: "Milch WS 1.29", shoppingDate: day(0), place: "supermarket" },
    { id: "papier", text: "Geschenkpapier", shoppingDate: day(4), place: "supermarket" },
  ],
};

describe("the handwritten week on the household's errands", () => {
  const week: Week = {
    slots: planSlots(),
    manualEntries: inputs.freeEntries.lines.map((text, i) => ({
      id: `free-${i}`,
      text,
      shoppingDate: MONDAY,
      place: "supermarket" as const,
    })),
  };

  it("buys the same as the one list did, spread over the errands", () => {
    expectSound(week);
  });

  it("buys Sunday's steak at the butcher on Saturday, and Saturday's lunch that morning", () => {
    const lines = onErrands(week);
    const steak = lines.find((line) => line.ingredientId === "rindersteaks");
    expect(steak).toMatchObject({ shoppingDate: day(5), place: "butcher" });
    const ginger = lines.find((line) => line.ingredientId === "ingwer");
    expect(ginger).toMatchObject({ shoppingDate: day(5), place: "market" });
  });
});

describe("a full week of the sample recipes", () => {
  it("is sound on the household's errands", () => {
    expectSound(fullWeek);
  });

  it("buys working-day lunches on the errand before their day", () => {
    const lines = onErrands(fullWeek);
    for (const line of lines.filter((entry) => entry.trip === "main")) {
      for (const { source } of line.contributions) {
        if (source.type !== "recipe" || source.meal !== "lunch") continue;
        if (source.date >= day(5)) continue;
        expect({ line: line.key, before: line.shoppingDate < source.date }).toEqual({
          line: line.key,
          before: true,
        });
      }
    }
  });

  it("buys more for leftovers, except where the recipe already feeds them as written", () => {
    const lines = onErrands(fullWeek);
    // The steak is for four: two portions more is six steaks.
    const steaks = lines.filter((line) => line.ingredientId === "rindersteaks");
    expect(steaks.reduce((sum, line) => sum + (line.purchase?.quantity ?? 0), 0)).toBe(6);
    // The lentil stew is for four to six: six persons are cooked as written.
    const withoutLeftovers = onErrands({
      ...fullWeek,
      slots: fullWeek.slots.map((slot) =>
        slot.kind === "recipes" ? { ...slot, extra: undefined } : slot,
      ),
    });
    const lentils = (all: ShoppingLine[]) =>
      all.filter((line) => line.ingredientId === "braune-linsen").map((line) => line.amounts);
    expect(lentils(lines)).toEqual(lentils(withoutLeftovers));
  });

  it("buys an extra without a day on the week's first supermarket day", () => {
    const lines = onErrands({ ...fullWeek, extras: [fullWeek.extras![1]] });
    const salami = lines.find((line) => line.ingredientId === "mini-salami");
    expect(salami).toMatchObject({ shoppingDate: day(0) });
  });

  it("gets the cold supper's bread from the bakery on its day", () => {
    const bread = onErrands(fullWeek).find((line) => line.ingredientId === "brot");
    expect(bread).toMatchObject({ shoppingDate: day(4), place: "bakery", shopByChoice: true });
  });

  it("lists every pantry staple once under what is at home", () => {
    const lines = onErrands(fullWeek);
    const atHome = notesOf(lines).flatMap((trip) =>
      presentByAisle(linesOn(lines, trip), {}, index).atHome.map((line) => ({ trip, line })),
    );
    const items = groupAtHome(atHome, index).flatMap((group) => group.items);
    const labels = items.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(expect.arrayContaining(["Salz"]));
    // Salt keeps: the week's first errand buys it for every meal, and it is at home once.
    const salt = items.find((item) => item.label === "Salz")!;
    expect(salt.lines.map(({ trip }) => noteId(trip))).toEqual([
      noteId({ date: MONDAY, place: "supermarket" }),
    ]);
  });
});

describe("a full week with lines moved", () => {
  it("stays sound when every line goes to the first note it may be moved to", () => {
    const lines = onErrands(fullWeek);
    const notes = notesOf(lines);
    const moves = new Map<string, ShoppingTrip>();
    for (const line of lines) {
      const here = { date: line.shoppingDate, place: line.place };
      const [target] = moveTargets(line, here, notes, TODAY, index);
      if (target) moves.set(moveKey(here, line.key), target);
    }
    expect(moves.size).toBeGreaterThan(5);
    const moved = expectSound({ ...fullWeek, moves });
    // Each moved part came from the note the move was made on.
    for (const line of moved) {
      for (const part of line.contributions) {
        if (!part.origin) continue;
        const target = moves.get(moveKey(part.origin, line.key));
        if (target) {
          expect(noteId(target)).toBe(noteId({ date: line.shoppingDate, place: line.place }));
        }
      }
    }
  });
});

describe("a full week planned after Monday's shopping", () => {
  const shopped = Date.parse(`${MONDAY}T15:00:00Z`);
  const doneAt = new Map([
    [noteId({ date: MONDAY, place: "supermarket" }), shopped],
    [noteId({ date: MONDAY, place: "butcher" }), shopped],
  ]);
  // Everything of the week was planned on Monday evening.
  const afterwards = { plannedOn: MONDAY, plannedAt: shopped + 3_600_000 };
  const late: Week = {
    ...fullWeek,
    slots: fullWeek.slots.map((slot) =>
      slot.kind === "recipes"
        ? { ...slot, items: slot.items.map((item) => ({ ...item, ...afterwards })) }
        : slot.kind === "free_text"
          ? { ...slot, foods: slot.foods?.map((food) => ({ ...food, ...afterwards })) }
          : slot,
    ),
    extras: fullWeek.extras!.map((extra) => ({
      ...extra,
      plannedOn: MONDAY,
      plannedAt: shopped + 3_600_000,
    })),
    doneAt,
  };

  it("buys nothing of it on Monday's errand, which was done before", () => {
    const lines = onErrands(late);
    expect(reasons(lines)).toEqual(reasons(inOneGo(late)));
    const monday = linesOn(lines, { date: MONDAY, place: "supermarket" });
    // What is left there is bought shortly before, or was typed onto the note.
    for (const line of monday) {
      const typed = line.contributions.every((part) => part.source.type === "manual");
      expect({ line: line.key, ok: typed || line.trip === "later" }).toEqual({
        line: line.key,
        ok: true,
      });
    }
    // Friday's errand is still to come and buys for the weekend as before.
    const friday = linesOn(lines, { date: day(4), place: "supermarket" });
    expect(friday.length).toBeGreaterThan(0);
  });
});
