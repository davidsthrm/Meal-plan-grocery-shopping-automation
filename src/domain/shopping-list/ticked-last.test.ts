import { describe, expect, it } from "vitest";
import type { Decision } from "./decisions";
import { settleTicked, splitByPlaced, type Settled, type ShownLine } from "./ticked-last";

const BOUGHT: Decision = { kind: "bought" };
const OPEN: Decision = { kind: "open" };

const line = (key: string, decision: Decision, more: Partial<ShownLine> = {}): ShownLine => ({
  key,
  decision,
  ...more,
});

/** The page drawn at `at` with these lines, then each step settled at its time. */
function steps(first: readonly ShownLine[], at: number, ...rest: [ShownLine[], number][]) {
  let settled: Settled = settleTicked(null, first, at);
  const seen = [settled];
  for (const [lines, now] of rest) {
    settled = settleTicked(settled, lines, now);
    seen.push(settled);
  }
  return seen;
}

const sorted = (keys: ReadonlySet<string>) => [...keys].sort();

describe("settleTicked", () => {
  it("places what was bought when the page was drawn at once", () => {
    const [drawn] = steps([line("eier", BOUGHT), line("milch", OPEN)], 0);
    expect(sorted(drawn.placed)).toEqual(["eier"]);
    expect(drawn.due).toBeNull();
  });

  it("moves a tick a moment after it, folding out of its place first", () => {
    const ticked = [line("eier", BOUGHT)];
    const [, tapped, waiting, folding, moved] = steps(
      [line("eier", OPEN)],
      0,
      [ticked, 1000],
      [ticked, 1449],
      [ticked, 1450],
      [ticked, 1610],
    );
    expect(sorted(tapped.placed)).toEqual([]);
    expect(tapped.due).toBe(1450);
    expect(waiting).toBe(tapped);
    expect(sorted(folding.folding)).toEqual(["eier"]);
    expect(sorted(folding.placed)).toEqual([]);
    expect(folding.due).toBe(1610);
    expect(sorted(moved.placed)).toEqual(["eier"]);
    expect(sorted(moved.folding)).toEqual([]);
    expect(moved.arrived).toEqual(["eier"]);
    expect(moved.due).toBeNull();
  });

  it("moves without folding where the fold is off, for less motion", () => {
    const drawn = settleTicked(null, [line("eier", OPEN)], 0);
    const tapped = settleTicked(drawn, [line("eier", BOUGHT)], 1000, { foldMs: 0 });
    const moved = settleTicked(tapped, [line("eier", BOUGHT)], 1450, { foldMs: 0 });
    expect(sorted(moved.placed)).toEqual(["eier"]);
    expect(moved.arrived).toEqual(["eier"]);
  });

  it("moves quick ticks together, after the last of them", () => {
    const both = [line("eier", BOUGHT), line("milch", BOUGHT)];
    const [, , second, early, together] = steps(
      [line("eier", OPEN), line("milch", OPEN)],
      0,
      [[line("eier", BOUGHT), line("milch", OPEN)], 1000],
      [both, 1300],
      [both, 1450],
      [both, 1750],
    );
    expect(second.due).toBe(1750);
    expect(sorted(early.folding)).toEqual([]);
    expect(sorted(together.folding)).toEqual(["eier", "milch"]);
  });

  it("does not move a tick taken back before its moment", () => {
    const [, , back, later] = steps(
      [line("eier", OPEN)],
      0,
      [[line("eier", BOUGHT)], 1000],
      [[line("eier", OPEN)], 1200],
      [[line("eier", OPEN)], 1450],
    );
    expect(back.due).toBeNull();
    expect(sorted(later.placed)).toEqual([]);
    expect(sorted(later.folding)).toEqual([]);
  });

  it("brings a line taken back out of Gekauft at once, also while it folds", () => {
    const [, back] = steps([line("eier", BOUGHT)], 0, [[line("eier", OPEN)], 5000]);
    expect(sorted(back.placed)).toEqual([]);
    expect(back.due).toBeNull();

    const [, , folding, stopped] = steps(
      [line("eier", OPEN)],
      0,
      [[line("eier", BOUGHT)], 1000],
      [[line("eier", BOUGHT)], 1450],
      [[line("eier", OPEN)], 1500],
    );
    expect(sorted(folding.folding)).toEqual(["eier"]);
    expect(sorted(stopped.folding)).toEqual([]);
    expect(sorted(stopped.placed)).toEqual([]);
  });

  it("says nothing new once a line came back", () => {
    const ticked = [line("eier", BOUGHT), line("milch", BOUGHT)];
    const [, , , moved, back] = steps(
      [line("eier", OPEN), line("milch", BOUGHT)],
      0,
      [ticked, 1000],
      [ticked, 1450],
      [ticked, 1610],
      [[line("eier", BOUGHT), line("milch", OPEN)], 2000],
    );
    expect(moved.arrived).toEqual(["eier"]);
    expect(back.arrived).toEqual([]);
  });

  it("changes nothing for a page from the server with the same lines bought", () => {
    const [, , moved] = steps(
      [line("eier", OPEN), line("milch", OPEN)],
      0,
      [[line("eier", BOUGHT), line("milch", OPEN)], 1000],
      [[line("eier", BOUGHT), line("milch", OPEN)], 1450],
    );
    const fromServer = [line("eier", { kind: "bought", amount: null }), line("milch", OPEN)];
    expect(settleTicked(moved, fromServer, 1500)).toBe(moved);
  });

  it("moves a tick from another device like one of this one", () => {
    const [, read, moved] = steps(
      [line("eier", OPEN)],
      0,
      // The page read again from the server, after someone else bought the eggs.
      [[line("eier", BOUGHT)], 20_000],
      [[line("eier", BOUGHT)], 20_610],
    );
    expect(read.due).toBe(20_450);
    expect(sorted(moved.placed)).toEqual([]);
    expect(sorted(moved.folding)).toEqual(["eier"]);
  });

  it("places at once a tick made before the page was drawn, kept on the device", () => {
    // The page drawn without a connection; the tick of an hour ago is read after it.
    const [, kept] = steps([line("eier", OPEN)], 3_600_000, [
      [line("eier", BOUGHT, { at: 1000 })],
      3_600_050,
    ]);
    expect(sorted(kept.placed)).toEqual(["eier"]);
    expect(kept.arrived).toEqual([]);
    expect(kept.due).toBeNull();
  });

  it("counts a line bought in part as bought", () => {
    const partial: Decision = {
      kind: "partial",
      amount: { quantity: 3, unit: "Stück" },
      remainder: { kind: "discarded" },
    };
    const [drawn] = steps([line("ensinger", partial)], 0);
    expect(sorted(drawn.placed)).toEqual(["ensinger"]);
  });

  it("moves no line that is removed or bought elsewhere: it goes where it stands", () => {
    const removed: Decision = { kind: "removed" };
    const moved: Decision = { kind: "moved", to: "2027-03-02.supermarket", shopId: null };
    const [, open, placed] = steps(
      [line("kerzen", OPEN), line("eier", BOUGHT)],
      0,
      [[line("kerzen", removed), line("eier", moved)], 1000],
      [[line("kerzen", removed), line("eier", moved)], 2000],
    );
    expect(open.due).toBeNull();
    expect(sorted(placed.folding)).toEqual([]);
    // Moved away from under "Gekauft", it says so there.
    expect(sorted(placed.placed)).toEqual(["eier"]);
  });

  it("forgets a line that is no longer on the page", () => {
    const [, gone] = steps([line("eier", BOUGHT), line("milch", BOUGHT)], 0, [
      [line("milch", BOUGHT)],
      1000,
    ]);
    expect(sorted(gone.placed)).toEqual(["milch"]);
  });

  it("leaves a line that is opened where it is until it is closed", () => {
    const [, held, still, closed, moved] = steps(
      [line("eier", OPEN)],
      0,
      [[line("eier", BOUGHT, { held: true })], 1000],
      [[line("eier", BOUGHT, { held: true })], 2000],
      [[line("eier", BOUGHT)], 3000],
      [[line("eier", BOUGHT)], 3450],
    );
    expect(held.due).toBeNull();
    expect(sorted(still.folding)).toEqual([]);
    expect(closed.due).toBe(3450);
    expect(sorted(moved.folding)).toEqual(["eier"]);

    // Opened under "Gekauft" and ticked open again, it comes back once it is closed.
    const [, openedThere, closedThere] = steps(
      [line("eier", BOUGHT)],
      0,
      [[line("eier", OPEN, { held: true })], 1000],
      [[line("eier", OPEN)], 2000],
    );
    expect(sorted(openedThere.placed)).toEqual(["eier"]);
    expect(sorted(closedThere.placed)).toEqual([]);
  });
});

describe("splitByPlaced", () => {
  const sections = [
    {
      shop: "Aldi",
      groups: [
        { name: "Obst & Gemüse", lines: [{ key: "apfel" }, { key: "birne" }] },
        { name: "Milchprodukte", lines: [{ key: "milch" }] },
      ],
    },
    { shop: "Rewe", groups: [{ name: "Obst & Gemüse", lines: [{ key: "dill" }] }] },
  ];

  it("keeps the sections and kinds on both sides, in their order, without empty ones", () => {
    const { open, bought } = splitByPlaced(sections, new Set(["birne", "milch"]));
    expect(open).toEqual([
      { shop: "Aldi", groups: [{ name: "Obst & Gemüse", lines: [{ key: "apfel" }] }] },
      { shop: "Rewe", groups: [{ name: "Obst & Gemüse", lines: [{ key: "dill" }] }] },
    ]);
    expect(bought).toEqual([
      {
        shop: "Aldi",
        groups: [
          { name: "Obst & Gemüse", lines: [{ key: "birne" }] },
          { name: "Milchprodukte", lines: [{ key: "milch" }] },
        ],
      },
    ]);
  });

  it("leaves everything open while nothing is placed", () => {
    const { open, bought } = splitByPlaced(sections, new Set());
    expect(open).toEqual(sections);
    expect(bought).toEqual([]);
  });
});
