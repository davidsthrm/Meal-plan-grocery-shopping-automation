import { describe, expect, it } from "vitest";
import fixtures from "../../../tests/fixtures/sample-week/recipes.json";
import type { ExpectedRecipe } from "./score";
import { flawless } from "./testing";
import { transcriptionForVerification } from "./verification";

const reading = flawless((fixtures.recipes as ExpectedRecipe[])[0]);

describe("transcriptionForVerification", () => {
  it("hands over the values without the printed lines", () => {
    const transcription = transcriptionForVerification(reading);
    expect(JSON.stringify(transcription)).not.toContain(reading.ingredients[0].raw);
    expect(transcription.ingredients).toHaveLength(reading.ingredients.length);
  });

  it("says persons when the recipe counts persons", () => {
    const transcription = transcriptionForVerification({
      ...reading,
      servingsMin: 4,
      servingsMax: 6,
      servingsRaw: "Für 4–6 Personen",
    });
    expect(transcription).toMatchObject({ servingsMin: 4, servingsMax: 6, servingsUnit: null });
  });

  it("shows the servings as they will be stored when the recipe counts something else", () => {
    const transcription = transcriptionForVerification({
      ...reading,
      servingsMin: null,
      servingsMax: null,
      servingsRaw: "Zutaten für 1 Springform (Ø 26 cm)",
    });
    expect(transcription).toMatchObject({
      servingsMin: 1,
      servingsMax: 1,
      servingsUnit: "Springform (Ø 26 cm)",
    });
  });
});
