import { describe, expect, it } from "vitest";
import { FORWARD, PAGE_MOTION, SWAP, TAB_BACK, TAB_FORWARD, sideways } from "./transitions";

describe("sideways", () => {
  it("brings a section further right in from the right, one further left from the left", () => {
    // Woche (0) to Einkauf (1), and back.
    expect(sideways(0, 1)).toEqual([TAB_FORWARD]);
    expect(sideways(1, 0)).toEqual([TAB_BACK]);
    expect(sideways(0, 4)).toEqual([TAB_FORWARD]);
  });

  it("cross-fades from a page of no section, such as the settings, and to the same one", () => {
    expect(sideways(-1, 2)).toEqual([SWAP]);
    expect(sideways(2, 2)).toEqual([SWAP]);
  });

  it("moves the page only for a navigation that names how", () => {
    expect(PAGE_MOTION.default).toBe("none");
    expect(PAGE_MOTION[FORWARD]).toBe(FORWARD);
  });
});
