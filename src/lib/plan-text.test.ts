import { describe, expect, it } from "vitest";
import { targetText } from "./plan-text";

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
