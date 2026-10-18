import { describe, expect, it } from "vitest";
import type { PlanSlot } from "@/domain/plan";
import { planNote } from "./plan-note";

const WEEK = "2026-10-19";
const titles: Record<string, string> = {
  steak: "Steak mit Pfefferrahmsoße",
  spaetzle: "Spätzle",
  kuchen: "Apfelkuchen",
};
const titleOf = (id: string) => titles[id] ?? null;
const recipes = (id: string, date: string, meal: PlanSlot["meal"], ...ids: string[]): PlanSlot => ({
  id,
  date,
  meal,
  kind: "recipes",
  items: ids.map((recipeId) => ({ recipeId, servings: 4 })),
});

describe("planNote", () => {
  const slots: PlanSlot[] = [
    recipes("a", "2026-10-19", "lunch", "steak", "spaetzle"),
    { id: "b", date: "2026-10-19", meal: "dinner", kind: "free_text", label: "Vesper" },
    { id: "c", date: "2026-10-20", meal: "lunch", kind: "leftovers", ofSlotId: "a" },
    { id: "d", date: "2026-10-21", meal: "dinner", kind: "away", label: "Oma Heidrun" },
    recipes("e", "2026-10-25", "coffee", "kuchen"),
  ];
  const note = planNote(
    WEEK,
    slots,
    [{ recipeId: "kuchen", servings: 4, note: null, date: "2026-10-24" }],
    titleOf,
  );

  it("names the week", () => {
    expect(note.title).toBe("Wochenplan 19.–25. Oktober");
  });

  it("has every day with lunch and dinner, an open meal empty to write on", () => {
    expect(note.days).toHaveLength(7);
    expect(note.days[0]).toEqual({
      date: "2026-10-19",
      label: "Mo 19.",
      meals: [
        { meal: "lunch", name: "Mittag", text: "Steak mit Pfefferrahmsoße + Spätzle" },
        { meal: "dinner", name: "Abend", text: "Vesper" },
      ],
    });
    expect(note.days[1].meals).toEqual([
      { meal: "lunch", name: "Mittag", text: "Reste vom Mo" },
      { meal: "dinner", name: "Abend", text: null },
    ]);
    expect(note.days[2].meals[1].text).toBe("Oma Heidrun");
  });

  it("has Sunday's coffee only when something is planned for it", () => {
    expect(note.days[6].meals.map((meal) => meal.name)).toEqual(["Mittag", "Kaffee", "Abend"]);
    const empty = planNote(WEEK, [], [], titleOf);
    expect(empty.days[6].meals.map((meal) => meal.meal)).toEqual(["lunch", "dinner"]);
    expect(empty.extras).toEqual([]);
  });

  it("lists the extras with their day", () => {
    expect(note.extras).toEqual(["Apfelkuchen (Sa)"]);
  });
});
