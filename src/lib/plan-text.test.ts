import { describe, expect, it } from "vitest";
import { plannedAtText, targetText } from "./plan-text";

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
