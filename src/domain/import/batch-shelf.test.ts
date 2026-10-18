import { describe, expect, it } from "vitest";
import { batchShelf, batchSource, type BatchRow } from "./batch-shelf";

const EH = "Einfach Hausgemacht";
const row = (id: string, createdAt: string, patch: Partial<BatchRow> = {}): BatchRow => ({
  id,
  createdAt,
  book: null,
  edition: null,
  recipes: 1,
  review: 0,
  recipeSources: [],
  ...patch,
});

describe("batchSource", () => {
  it("is what the batch names", () => {
    expect(batchSource(row("a", "1", { book: EH, edition: "05/2026" }))).toEqual({
      book: EH,
      edition: "05/2026",
    });
  });

  it("splits a name stored before editions were kept apart", () => {
    expect(batchSource(row("a", "1", { book: "Einfach Hausgemacht Jahresheft 2021" }))).toEqual({
      book: EH,
      edition: "Jahresheft 2021",
    });
    expect(batchSource(row("a", "1", { book: "Speed Cooking" }))).toEqual({
      book: "Speed Cooking",
      edition: null,
    });
  });

  it("is what all its recipes name when the batch names nothing", () => {
    const sameIssue = { book: "Einfach Hausgemacht 06/2020", edition: null };
    expect(batchSource(row("a", "1", { recipeSources: [sameIssue, sameIssue] }))).toEqual({
      book: EH,
      edition: "06/2020",
    });
    expect(
      batchSource(
        row("a", "1", { recipeSources: [sameIssue, { book: "Speed Cooking", edition: null }] }),
      ),
    ).toBeNull();
    expect(
      batchSource(row("a", "1", { recipeSources: [sameIssue, { book: null, edition: null }] })),
    ).toBeNull();
    expect(batchSource(row("a", "1"))).toBeNull();
  });
});

describe("batchShelf", () => {
  const shelf = batchShelf([
    row("cookbook", "2026-10-12T08:00", { book: "Speed Cooking", recipes: 83 }),
    row("annual", "2026-10-18T10:00", { book: "Einfach Hausgemacht Jahresheft 2021" }),
    row("june", "2026-10-18T09:00", {
      recipes: 2,
      recipeSources: [
        { book: "Einfach Hausgemacht 06/2020", edition: null },
        { book: "Einfach Hausgemacht 06/2020", edition: null },
      ],
    }),
    row("may", "2026-10-19T09:00", { book: EH, edition: "05/2026", recipes: 4, review: 1 }),
    row("loose", "2026-10-17T09:00", { recipes: 1 }),
  ]);

  it("makes a magazine one folder with its editions, the newest on top", () => {
    expect(shelf[0]).toEqual({
      kind: "stack",
      book: EH,
      recipes: 7,
      editions: [
        {
          edition: "05/2026",
          batches: [{ id: "may", createdAt: "2026-10-19T09:00", recipes: 4, review: 1 }],
        },
        {
          edition: "Jahresheft 2021",
          batches: [{ id: "annual", createdAt: "2026-10-18T10:00", recipes: 1, review: 0 }],
        },
        {
          edition: "06/2020",
          batches: [{ id: "june", createdAt: "2026-10-18T09:00", recipes: 2, review: 0 }],
        },
      ],
    });
  });

  it("keeps a cookbook and a batch without any book as rows of their own, newest first", () => {
    expect(
      shelf.slice(1).map((entry) => (entry.kind === "batch" ? entry.batch.id : entry.book)),
    ).toEqual(["loose", "cookbook"]);
    expect(shelf[1]).toMatchObject({ kind: "batch", source: null });
  });

  it("makes a cookbook photographed in two sittings a folder too", () => {
    const twice = batchShelf([
      row("one", "2026-10-12", { book: "Speed Cooking" }),
      row("two", "2026-10-13", { book: "Speed Cooking" }),
    ]);
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ kind: "stack", editions: [{ edition: null }] });
  });
});
