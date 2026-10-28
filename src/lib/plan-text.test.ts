import { describe, expect, it } from "vitest";
import { nextMealText, targetText } from "./plan-text";

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

describe("nextMealText", () => {
  const salmon = { text: "Lachs mit Dill", recipe: true };
  const oma = { text: "Oma Heidrun", recipe: false };

  it("names lunch in the morning and dinner from the afternoon", () => {
    expect(nextMealText(9, oma, salmon)).toBe("Heute Mittag: Oma Heidrun.");
    expect(nextMealText(14, oma, salmon)).toBe("Heute Abend gibt's Lachs mit Dill.");
  });

  it("says nothing late in the evening or for a meal with nothing on it", () => {
    expect(nextMealText(21, oma, salmon)).toBeNull();
    expect(nextMealText(18, oma, null)).toBeNull();
  });
});
