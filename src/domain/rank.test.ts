import { describe, expect, it } from "vitest";
import { rank, shuffled } from "./rank";

const items = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((item) => item.id).join("");

describe("shuffled", () => {
  it("keeps every item and gives the same order for the same seed", () => {
    expect(ids(shuffled(items, "Monday")).split("").sort().join("")).toBe("abcdefgh");
    expect(ids(shuffled(items, "Monday"))).toBe(ids(shuffled(items, "Monday")));
  });

  it("gives another order for another seed", () => {
    const orders = new Set(
      ["Mo", "Di", "Mi", "Do", "Fr"].map((seed) => ids(shuffled(items, seed))),
    );
    expect(orders.size).toBeGreaterThan(3);
    expect(orders.has("abcdefgh")).toBe(false);
  });

  it("does not change the list it was given", () => {
    shuffled(items, "x");
    expect(ids(items)).toBe("abcdefgh");
  });

  it("ranks with whole numbers", () => {
    expect(Number.isInteger(rank("seed", "id"))).toBe(true);
    expect(rank("seed", "id")).toBeGreaterThanOrEqual(0);
  });
});
