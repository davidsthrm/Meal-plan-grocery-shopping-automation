import { describe, expect, it } from "vitest";
import { cropFor, cropsFor, turnFor, type PageFrame } from "./frame";

const near = (crop: ReturnType<typeof cropFor>) =>
  crop && Object.fromEntries(Object.entries(crop).map(([key, value]) => [key, +value.toFixed(2)]));

describe("turnFor", () => {
  it("turns the photo so that the top of the text is at the top", () => {
    expect(turnFor("top")).toBe(0);
    // The top of the text at the left edge: the page lies on its left side.
    expect(turnFor("left")).toBe(90);
    expect(turnFor("bottom")).toBe(180);
    expect(turnFor("right")).toBe(270);
  });
});

describe("cropFor", () => {
  it("gives the marked part a margin, and stays inside the photo", () => {
    expect(near(cropFor({ left: 0.5, top: 0.1, right: 0.96, bottom: 0.7 }))).toEqual({
      left: 0.46,
      top: 0.06,
      width: 0.54,
      height: 0.68,
    });
    expect(near(cropFor({ left: 0.02, top: 0.0, right: 0.5, bottom: 0.99 }))).toEqual({
      left: 0,
      top: 0,
      width: 0.54,
      height: 1,
    });
  });

  it("shows the whole page when the part is most of it anyway", () => {
    expect(cropFor({ left: 0.02, top: 0.05, right: 0.99, bottom: 0.95 })).toBeNull();
  });

  it("shows the whole page rather than a box that makes no sense", () => {
    expect(cropFor({ left: 0.4, top: 0.4, right: 0.45, bottom: 0.9 })).toBeNull();
    expect(cropFor({ left: 0.6, top: 0.1, right: 0.3, bottom: 0.9 })).toBeNull();
    expect(cropFor({ left: Number.NaN, top: 0, right: 1, bottom: 1 })).toBeNull();
  });
});

describe("cropsFor", () => {
  const frame: PageFrame = {
    textTop: "top",
    recipes: [
      { title: "Wassermelonen-Shake", left: 0.54, top: 0.09, right: 0.93, bottom: 0.62 },
      { title: "beeren-kokos-smoothie", left: 0.11, top: 0.27, right: 0.51, bottom: 0.73 },
    ],
  };

  it("finds each recipe's part by its title, however the model wrote it", () => {
    const crops = cropsFor(frame, ["Beeren-Kokos-Smoothie", "Wassermelonen-Shake"]);
    expect(near(crops.get("Beeren-Kokos-Smoothie") ?? null)).toMatchObject({
      left: 0.07,
      top: 0.23,
    });
    expect(near(crops.get("Wassermelonen-Shake") ?? null)).toMatchObject({ left: 0.5, top: 0.05 });
  });

  it("shows a page whole that holds one recipe", () => {
    expect(cropsFor(frame, ["Wassermelonen-Shake"]).get("Wassermelonen-Shake")).toBeNull();
  });

  it("shows the page whole for a recipe the model did not mark, or marked twice", () => {
    const crops = cropsFor({ ...frame, recipes: [frame.recipes[0], frame.recipes[0]] }, [
      "Wassermelonen-Shake",
      "Beeren-Kokos-Smoothie",
    ]);
    expect(crops.get("Wassermelonen-Shake")).toBeNull();
    expect(crops.get("Beeren-Kokos-Smoothie")).toBeNull();
  });
});
