import { describe, expect, it } from "vitest";
import { recipeForMeal } from "./for-meal";

const recipes = (...titles: string[]) => titles.map((title) => ({ title }));

describe("recipeForMeal", () => {
  it("takes the one recipe that was read, whatever it is called", () => {
    expect(recipeForMeal("Lasagne", recipes("Lasagne al forno"))?.title).toBe("Lasagne al forno");
    expect(recipeForMeal("Nudeln", recipes("Spaghetti Carbonara"))?.title).toBe(
      "Spaghetti Carbonara",
    );
  });

  it("picks by name among the recipes of a double page", () => {
    const page = recipes("Gemüse-Lasagne", "Tiramisu", "Minestrone");
    expect(recipeForMeal("Lasagne", page)?.title).toBe("Gemüse-Lasagne");
    expect(recipeForMeal("minestrone mit Pesto", page)?.title).toBe("Minestrone");
    expect(recipeForMeal("Gemuese Lasagne", page)?.title).toBe("Gemüse-Lasagne");
  });

  it("does not guess when the name fits none or several", () => {
    expect(recipeForMeal("Pizza", recipes("Gemüse-Lasagne", "Tiramisu"))).toBeNull();
    expect(recipeForMeal("Lasagne", recipes("Gemüse-Lasagne", "Lasagne Bolognese"))).toBeNull();
    expect(recipeForMeal("", recipes("Gemüse-Lasagne", "Tiramisu"))).toBeNull();
    expect(recipeForMeal("Lasagne", [])).toBeNull();
  });
});
