import { describe, expect, it } from "vitest";
import { timeText } from "./recipe-text";

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
