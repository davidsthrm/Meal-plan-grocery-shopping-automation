import { describe, expect, it } from "vitest";
import { stepAfter, stepText } from "./cooking";

describe("stepAfter", () => {
  it("starts with the first step and goes on one at a time", () => {
    expect(stepAfter(null, 4, "forward")).toBe(0);
    expect(stepAfter(0, 4, "forward")).toBe(1);
    expect(stepAfter(2, 4, "back")).toBe(1);
  });

  it("stays on the last and on the first step", () => {
    expect(stepAfter(3, 4, "forward")).toBe(3);
    expect(stepAfter(0, 4, "back")).toBe(0);
    expect(stepAfter(null, 4, "back")).toBeNull();
  });

  it("has nothing to go to without steps", () => {
    expect(stepAfter(null, 0, "forward")).toBeNull();
    expect(stepAfter(2, 0, "back")).toBeNull();
  });
});

describe("stepText", () => {
  it("says where the cook is, or how many steps there are", () => {
    expect(stepText(1, 5)).toBe("Schritt 2 von 5");
    expect(stepText(null, 5)).toBe("5 Schritte");
    expect(stepText(null, 1)).toBe("1 Schritt");
    expect(stepText(null, 0)).toBe("Keine Arbeitsschritte");
  });
});
