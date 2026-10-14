import { describe, expect, it } from "vitest";
import { lastCookedText, timeText } from "./recipe-text";

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
