import { describe, expect, it } from "vitest";
import { amountText, ingredientText, lastCookedText, timeText } from "./recipe-text";

describe("timeText", () => {
  it("says the printed minutes where the cookbook prints them", () => {
    expect(timeText({ prepMinutes: 25, tags: ["alltag"] })).toBe("25 Min.");
  });

  it("says how much work a recipe is where no time is printed", () => {
    expect(timeText({ prepMinutes: null, tags: ["schnell", "pasta"] })).toBe("Schnell");
    expect(timeText({ prepMinutes: null, tags: ["alltag"] })).toBe("Alltagsküche");
    expect(timeText({ prepMinutes: null, tags: ["aufwendig"] })).toBe("Braucht Zeit");
  });

  it("says nothing when neither is known", () => {
    expect(timeText({ prepMinutes: null, tags: ["pasta"] })).toBeNull();
  });
});

describe("lastCookedText", () => {
  it("names the day, and the year only when it was another one", () => {
    expect(lastCookedText("2026-10-12", "2026-10-14")).toBe("Zuletzt gekocht am 12. Oktober");
    expect(lastCookedText("2025-11-03", "2026-10-14")).toBe("Zuletzt gekocht am 3. November 2025");
  });

  it("says so when the recipe was never cooked", () => {
    expect(lastCookedText(null, "2026-10-14")).toBe("Noch nie gekocht");
  });
});

describe("a recipe line", () => {
  const shallots = { name: "Schalotten", synonyms: ["Schalotte"] };

  it("writes pieces as a bare number and one piece in the singular", () => {
    // It read "1 Stück Schalotten".
    expect(amountText(1, null, "Stück")).toBe("1");
    expect(ingredientText(shallots, 1, null, "Stück")).toBe("Schalotte");
    expect(ingredientText(shallots, 0.5, null, "Stück")).toBe("Schalotte");
    expect(ingredientText(shallots, 2, null, "Stück")).toBe("Schalotten");
    expect(ingredientText(shallots, 1, 2, "Stück")).toBe("Schalotten");
  });

  it("keeps every other unit with the amount", () => {
    expect(amountText(250, null, "g")).toBe("250 g");
    expect(amountText(2, 3, "Zehe")).toBe("2–3 Zehen");
    expect(amountText(1.5, 2, "Stück")).toBe("1,5–2");
    expect(ingredientText(shallots, 1, null, "Bund")).toBe("Schalotten");
    expect(amountText(null, null, null)).toBe("");
  });
});
