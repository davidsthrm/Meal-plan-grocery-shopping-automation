import { describe, expect, it } from "vitest";
import { copyOfWeek, slotKey, type PlanSlot } from "./plan";

const lastWeek: PlanSlot[] = [
  {
    id: "a",
    date: "2026-10-05",
    meal: "lunch",
    kind: "recipes",
    items: [
      { recipeId: "lasagne", servings: 4 },
      { recipeId: "salat", servings: 4 },
    ],
  },
  { id: "b", date: "2026-10-05", meal: "dinner", kind: "free_text", label: "Vesper" },
  { id: "c", date: "2026-10-06", meal: "lunch", kind: "leftovers", ofSlotId: "a" },
  { id: "d", date: "2026-10-07", meal: "lunch", kind: "away", label: "bei Oma" },
  { id: "e", date: "2026-10-11", meal: "dinner", kind: "skipped" },
];

describe("copyOfWeek", () => {
  it("moves every meal by the given days and keeps what it was", () => {
    expect(copyOfWeek(lastWeek, 7, new Set())).toEqual([
      {
        date: "2026-10-12",
        meal: "lunch",
        content: {
          kind: "recipes",
          items: [
            { recipeId: "lasagne", servings: 4 },
            { recipeId: "salat", servings: 4 },
          ],
        },
      },
      { date: "2026-10-12", meal: "dinner", content: { kind: "free_text", label: "Vesper" } },
      { date: "2026-10-13", meal: "lunch", content: { kind: "leftovers" } },
      { date: "2026-10-14", meal: "lunch", content: { kind: "away", label: "bei Oma" } },
      { date: "2026-10-18", meal: "dinner", content: { kind: "skipped" } },
    ]);
  });

  it("leaves alone what the new week has planned already", () => {
    const taken = new Set([slotKey("2026-10-12", "lunch"), slotKey("2026-10-14", "lunch")]);
    expect(copyOfWeek(lastWeek, 7, taken).map((slot) => slotKey(slot.date, slot.meal))).toEqual([
      "2026-10-12:dinner",
      "2026-10-13:lunch",
      "2026-10-18:dinner",
    ]);
  });
});
