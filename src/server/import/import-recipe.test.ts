import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createCatalogIndex } from "@/domain/catalog";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import type { ExpectedRecipe } from "@/domain/import/score";
import { flawless } from "@/domain/import/testing";
import { seedCatalog } from "../../../supabase/seed/catalog";
import fixtures from "../../../tests/fixtures/sample-week/recipes.json";
import { importRecipe, type ImportDeps } from "./import-recipe";
import { RecipeReadError, type RecipeVerification } from "./read-recipe";

const index = createCatalogIndex(seedCatalog);
const expected = fixtures.recipes as ExpectedRecipe[];
const reading = (id: string) => flawless(expected.find((r) => r.id === id)!);
const usage = { inputTokens: 8000, outputTokens: 3000 };

async function photo(): Promise<Buffer> {
  return sharp({ create: { width: 60, height: 80, channels: 3, background: "#ddd" } })
    .jpeg()
    .toBuffer();
}

/** Stand-ins for the two model calls. */
function deps(
  recipe: ExtractedRecipe,
  problems: RecipeVerification["verification"]["problems"] = [],
) {
  const read = vi.fn<ImportDeps["read"]>().mockResolvedValue({ recipe, model: "m", usage });
  const verify = vi
    .fn<ImportDeps["verify"]>()
    .mockResolvedValue({ verification: { problems }, model: "m", usage });
  return { read, verify, index };
}

describe("importRecipe", () => {
  it("approves a recipe when nothing at all came up", async () => {
    const d = deps(reading("IMG_5683"));
    const result = await importRecipe([await photo()], { book: "Suppen und Eintöpfe" }, d);

    expect(result.status).toBe("approved");
    expect(result.issues).toEqual([]);
    expect(result.draft).toMatchObject({
      title: "Linsen-Eintopf",
      sourceBook: "Suppen und Eintöpfe",
      sourcePage: 84,
      servings: { min: 4, max: 6 },
    });
    expect(result.draft!.ingredients).toHaveLength(14);
    expect(result.usage).toEqual({ inputTokens: 16000, outputTokens: 6000 });
    // Both passes saw the same normalised photos, labelled by page.
    expect(d.read.mock.calls[0][0].map((image) => image.label)).toEqual(["Page 1"]);
    expect(d.verify.mock.calls[0][0]).toBe(d.read.mock.calls[0][0]);
  });

  it("labels several photos of one recipe as pages in order", async () => {
    const d = deps(reading("IMG_5683"));
    const result = await importRecipe([await photo(), await photo()], {}, d);
    expect(result.images.map((image) => image.label)).toEqual(["Page 1", "Page 2"]);
  });

  it("sends a recipe to review when the photo has no title and none was entered", async () => {
    const result = await importRecipe([await photo()], {}, deps(reading("IMG_5684")));
    expect(result.status).toBe("needs_review");
    expect(result.issues.map((issue) => issue.code)).toEqual(["title_missing"]);
  });

  it("approves that same recipe once the household entered the title", async () => {
    const result = await importRecipe(
      [await photo()],
      { title: "Avocado Spaghetti", book: "Speed Cooking" },
      deps(reading("IMG_5684")),
    );
    expect(result.status).toBe("approved");
    expect(result.draft).toMatchObject({ title: "Avocado Spaghetti", sourceTitle: null });
  });

  it("sends a recipe to review when the second pass sees something different", async () => {
    const result = await importRecipe(
      [await photo()],
      {},
      deps(reading("IMG_5682"), [
        { ingredientIndex: 3, field: "quantity", printed: "¾ l", transcribed: "0.25 l" },
      ]),
    );
    expect(result.status).toBe("needs_review");
    expect(result.issues).toEqual([
      {
        code: "verification_disagrees",
        ingredientIndex: 3,
        detail: 'quantity: printed "¾ l", read as "0.25 l"',
      },
    ]);
  });

  it("never approves a recipe the second pass could not check", async () => {
    const d = deps(reading("IMG_5683"));
    d.verify.mockRejectedValue(new RecipeReadError("truncated", "The model's answer was cut off."));
    const result = await importRecipe([await photo()], {}, d);
    expect(result.status).toBe("needs_review");
    expect(result.issues.map((issue) => issue.code)).toEqual(["read_failed"]);
    expect(result.draft).not.toBeNull();
  });

  it("reports a photo that could not be read, without calling the second pass", async () => {
    const d = deps(reading("IMG_5683"));
    d.read.mockRejectedValue(
      new RecipeReadError("refused", "The model declined to read this photo."),
    );
    const result = await importRecipe([await photo()], {}, d);
    expect(result).toMatchObject({ status: "failed", draft: null, extraction: null });
    expect(d.verify).not.toHaveBeenCalled();
  });

  it("does not swallow errors that are not about the model's answer", async () => {
    const d = deps(reading("IMG_5683"));
    d.read.mockRejectedValue(new Error("network down"));
    await expect(importRecipe([await photo()], {}, d)).rejects.toThrow("network down");
  });

  it("keeps the model's harmless observations apart from the issues", async () => {
    const recipe = reading("IMG_5680");
    recipe.notes.push("Tippkasten mit vegetarischer Variante wurde nicht übernommen.");
    const result = await importRecipe([await photo()], {}, deps(recipe));
    expect(result.status).toBe("approved");
    expect(result.notes).toEqual(["Tippkasten mit vegetarischer Variante wurde nicht übernommen."]);
  });
});
