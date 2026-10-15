import { describe, expect, it } from "vitest";
import { readPages } from "./paging";

/** A table of `count` numbered rows, read the way the API answers: a range at most. */
function table(count: number) {
  const asked: number[] = [];
  const page = async (from: number, to: number) => {
    asked.push(from);
    return Array.from({ length: Math.max(0, Math.min(to + 1, count) - from) }, (_, i) => from + i);
  };
  return { page, asked };
}

describe("readPages", () => {
  it("reads a short table with one request", async () => {
    const { page, asked } = table(7);
    expect(await readPages(page, 10)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(asked).toEqual([0]);
  });

  it("reads a long table whole and in order, several pages at a time", async () => {
    const { page, asked } = table(113);
    const rows = await readPages(page, 10, 4);
    expect(rows).toEqual(Array.from({ length: 113 }, (_, i) => i));
    // One page, then twelve more in three rounds of four.
    expect(asked).toHaveLength(13);
  });

  it("stops at a table that ends exactly at a page", async () => {
    const { page } = table(40);
    expect(await readPages(page, 10, 4)).toHaveLength(40);
  });
});
