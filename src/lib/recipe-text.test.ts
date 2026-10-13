import { describe, expect, it } from "vitest";
import { amountText, timeText } from "./recipe-text";

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

describe("amountText", () => {
  it("counts pieces with an x in front of the ingredient, never as Stück", () => {
    expect(amountText(1, null, "Stück")).toBe("1x");
    expect(amountText(3, null, "Stück")).toBe("3x");
    expect(amountText(2, 3, "Stück")).toBe("2–3x");
    expect(amountText(0.5, null, "Stück")).toBe("½");
  });

  it("writes everything else with its unit", () => {
    expect(amountText(250, null, "g")).toBe("250 g");
    expect(amountText(2, null, "Dose")).toBe("2 Dosen");
    expect(amountText(0.5, null, "Bund")).toBe("½ Bund");
    expect(amountText(1, 2, "EL")).toBe("1–2 EL");
  });

  it("says nothing without an amount", () => {
    expect(amountText(null, null, null)).toBe("");
  });
});
