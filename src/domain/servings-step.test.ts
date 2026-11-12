import { describe, expect, it } from "vitest";
import { servingsAfterStep, shownServings } from "./servings-step";

describe("servingsAfterStep", () => {
  it("asks for one more or one less", () => {
    expect(servingsAfterStep(4, 1)).toBe(5);
    expect(servingsAfterStep(4, -1)).toBe(3);
  });

  it("goes down to zero, which takes the recipe off, and no further", () => {
    expect(servingsAfterStep(1, -1)).toBe(0);
    expect(servingsAfterStep(0, -1)).toBe(0);
  });

  it("stops at 99", () => {
    expect(servingsAfterStep(99, 1)).toBe(99);
    expect(servingsAfterStep(98, 1)).toBe(99);
  });
});

describe("shownServings", () => {
  it("shows what is planned while nothing is on its way", () => {
    expect(shownServings(4, undefined)).toBe(4);
    expect(shownServings(4, null)).toBe(4);
  });

  it("shows what the tap on its way asked for", () => {
    expect(shownServings(4, "5")).toBe(5);
    expect(shownServings(1, "0")).toBe(0);
  });

  it("ignores what is not a number of servings", () => {
    expect(shownServings(4, "")).toBe(4);
    expect(shownServings(4, "-1")).toBe(4);
    expect(shownServings(4, "abc")).toBe(4);
  });

  it("adds up taps that queue behind each other", () => {
    // Each tap sends the number after the one shown, and the stepper then shows what it sent.
    let sent: string | undefined;
    for (let tap = 0; tap < 3; tap++) {
      sent = String(servingsAfterStep(shownServings(4, sent), 1));
    }
    expect(shownServings(4, sent)).toBe(7);
  });
});
