import { describe, expect, it } from "vitest";
import { enqueue, forget, KEEP_SENT_MS, settle, shownChecked, waiting, type Tick } from "./ticks";

const NOTE = "2026-10-12.supermarket";

const tick = (
  id: string,
  key: string,
  checked: boolean,
  at: number,
  sentAt: number | null = null,
): Tick => ({
  id,
  note: NOTE,
  key,
  checked,
  at,
  sentAt,
});

describe("enqueue", () => {
  it("keeps one tick per line, the last one", () => {
    const ticks = enqueue(
      enqueue([], tick("a", "milch@main", true, 1)),
      tick("b", "milch@main", false, 2),
    );
    expect(ticks.map((each) => each.id)).toEqual(["b"]);
  });

  it("keeps ticks of other lines and of the same line on another note", () => {
    const friday = { ...tick("c", "milch@main", true, 3), note: "2026-10-16.supermarket" };
    const ticks = [tick("a", "milch@main", true, 1), tick("b", "eier@main", true, 2)].reduce(
      enqueue,
      [] as Tick[],
    );
    expect(enqueue(ticks, friday).map((each) => each.id)).toEqual(["a", "b", "c"]);
  });

  it("replaces a tick the server already has, so that the new one is sent", () => {
    const ticks = enqueue([tick("a", "milch@main", true, 1, 5)], tick("b", "milch@main", false, 6));
    expect(waiting(ticks).map((each) => each.id)).toEqual(["b"]);
  });
});

describe("waiting", () => {
  it("lists what is still to send, the oldest first, at most one request's worth", () => {
    const ticks = [
      tick("late", "a", true, 30),
      tick("sent", "b", true, 10, 12),
      tick("early", "c", true, 20),
      tick("earliest", "d", false, 5),
    ];
    expect(waiting(ticks).map((each) => each.id)).toEqual(["earliest", "early", "late"]);
    expect(waiting(ticks, 2).map((each) => each.id)).toEqual(["earliest", "early"]);
  });
});

describe("settle", () => {
  it("marks what the server took, with the time it did", () => {
    const ticks = settle([tick("a", "x", true, 1), tick("b", "y", true, 2)], { taken: ["a"] }, 9);
    expect(ticks).toEqual([tick("a", "x", true, 1, 9), tick("b", "y", true, 2)]);
  });

  it("does not take a tick made on the same line while the earlier one was on its way", () => {
    // Sent: "a". Meanwhile the line was opened again ("b"). The answer names "a" only.
    const ticks = enqueue([tick("a", "x", true, 1)], tick("b", "x", false, 2));
    expect(waiting(settle(ticks, { taken: ["a"] }, 3)).map((each) => each.id)).toEqual(["b"]);
  });

  it("drops what the server refused for good", () => {
    const ticks = settle(
      [tick("a", "x", true, 1), tick("b", "y", true, 2)],
      { taken: [], refused: ["b"] },
      3,
    );
    expect(ticks.map((each) => each.id)).toEqual(["a"]);
  });

  it("keeps the first time a tick was taken when an answer comes twice", () => {
    const once = settle([tick("a", "x", true, 1)], { taken: ["a"] }, 5);
    expect(settle(once, { taken: ["a"] }, 8)[0].sentAt).toBe(5);
  });
});

describe("shownChecked", () => {
  const line = { note: NOTE, key: "milch@main" };

  it("shows the page where the device has no tick of its own", () => {
    expect(shownChecked([], line, { checked: true, renderedAt: 10 })).toBe(true);
  });

  it("shows a waiting tick, however new the page", () => {
    expect(
      shownChecked([tick("a", "milch@main", true, 5)], line, { checked: false, renderedAt: 50 }),
    ).toBe(true);
    expect(
      shownChecked([tick("a", "milch@main", false, 5)], line, { checked: true, renderedAt: 50 }),
    ).toBe(false);
  });

  it("shows a sent tick on a page drawn before the server took it", () => {
    // The page was kept for the shop at 10; the tick reached the server at 20.
    expect(
      shownChecked([tick("a", "milch@main", true, 5, 20)], line, {
        checked: false,
        renderedAt: 10,
      }),
    ).toBe(true);
  });

  it("shows the page once it was drawn after the server took the tick", () => {
    // Someone else opened the line again afterwards: the page knows, the device does not.
    expect(
      shownChecked([tick("a", "milch@main", true, 5, 20)], line, {
        checked: false,
        renderedAt: 30,
      }),
    ).toBe(false);
  });

  it("does not mix up lines", () => {
    expect(
      shownChecked([tick("a", "eier@main", true, 5)], line, { checked: false, renderedAt: 1 }),
    ).toBe(false);
  });
});

describe("forget", () => {
  it("forgets ticks the server took long ago, never waiting ones", () => {
    const now = KEEP_SENT_MS + 100;
    const ticks = [
      tick("old", "a", true, 1, 50),
      tick("recent", "b", true, 1, now - 10),
      tick("waits", "c", true, 1),
    ];
    expect(forget(ticks, now).map((each) => each.id)).toEqual(["recent", "waits"]);
  });
});
