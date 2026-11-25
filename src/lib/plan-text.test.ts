import { describe, expect, it } from "vitest";
import { plannedAtText, targetText, whyText } from "./plan-text";

describe("plannedAtText", () => {
  it("names the meal and its day", () => {
    expect(plannedAtText({ week: "2026-11-23", date: "2026-11-29", meal: "dinner" })).toBe(
      "Eingeplant: Sonntag Abend, 29. November",
    );
  });

  it("names the week of a recipe needed besides the meals", () => {
    expect(plannedAtText({ week: "2026-11-30", date: null, meal: null })).toBe(
      "Eingeplant: Außerdem in der Woche vom 30. November",
    );
  });
});

describe("targetText", () => {
  const line = (count: number, min: number | null, max: number | null) => ({
    group: "vegetarian" as const,
    count,
    min,
    max,
  });

  it("says the goal until the week reaches it, then that it is reached", () => {
    expect(targetText(line(2, 3, null))).toBe("mind. 3");
    expect(targetText(line(3, 3, null))).toBe("geschafft");
    expect(targetText(line(4, 3, null))).toBe("geschafft");
    expect(targetText(line(1, 1, 2))).toBe("geschafft");
    expect(targetText(line(3, 1, 2))).toBe("1 bis 2");
  });

  it("never calls a limit alone reached", () => {
    expect(targetText(line(0, null, 2))).toBe("max. 2");
    expect(targetText(line(2, null, 2))).toBe("max. 2");
    expect(targetText(line(0, null, null))).toBe("");
  });
});

describe("whyText", () => {
  it("joins two reasons for a recipe with a dot", () => {
    expect(whyText([{ kind: "wanted" }, { kind: "favorite" }])).toBe(
      "Auf der Wunschliste · Favorit",
    );
  });

  // Audit, 24 November 2026: "Möchtest du kochen · Erst vor einer Woche gekocht" read as two
  // reasons for it.
  it("says a reason against after one for with an aber", () => {
    expect(whyText([{ kind: "wanted" }, { kind: "recent", weeks: 1 }])).toBe(
      "Auf der Wunschliste, aber erst vor einer Woche gekocht",
    );
    expect(whyText([{ kind: "never_cooked" }, { kind: "repeats", tag: "Hackfleisch" }])).toBe(
      "Noch nie gekocht, aber schon Hackfleisch diese Woche",
    );
  });

  it("joins two reasons against with a dot", () => {
    expect(
      whyText([
        { kind: "recent", weeks: 2 },
        { kind: "group_full", group: "fish" },
      ]),
    ).toBe("Erst vor 2 Wochen gekocht · Schon genug Fisch diese Woche");
  });
});
