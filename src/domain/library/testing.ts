import type { RecipeSummary } from "./summary";

/** Test helper: a recipe summary with sensible values for everything a test does not care about. */
export function summary(id: string, patch: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    title: id,
    kind: "cookbook",
    category: "hauptgericht",
    proteinType: "vegetarian",
    prepMinutes: 30,
    isFavorite: false,
    sourceBook: "Speed Cooking",
    sourcePage: null,
    servings: { min: 4, max: 4, unit: null },
    addedOn: "2026-01-05",
    tags: [],
    wanted: false,
    ...patch,
  };
}
