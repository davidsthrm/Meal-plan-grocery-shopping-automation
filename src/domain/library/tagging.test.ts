import { describe, expect, it } from "vitest";
import { settleEffort, taggingLine, tagsFromSuggestion, type TagSuggestion } from "./tagging";

const suggestion = (patch: Partial<TagSuggestion> = {}): TagSuggestion => ({
  n: 1,
  effort: "schnell",
  dish: [],
  cuisine: null,
  seasons: [],
  occasions: [],
  ...patch,
});

describe("taggingLine", () => {
  it("tells the model what is known about a recipe, in one line", () => {
    expect(
      taggingLine(
        {
          title: "Kürbisrisotto",
          category: "Hauptgericht",
          prepMinutes: 40,
          ingredients: ["Kürbis", "Risottoreis", "Parmesan"],
        },
        3,
      ),
    ).toBe(
      "3. Kürbisrisotto | Art: Hauptgericht | Zeit laut Rezept: 40 Min. | Zutaten: Kürbis, Risottoreis, Parmesan",
    );
    expect(
      taggingLine({ title: "Vesper", category: null, prepMinutes: null, ingredients: [] }, 1),
    ).toBe("1. Vesper");
  });
});

describe("settleEffort", () => {
  it("takes the estimate where no time is printed", () => {
    expect(settleEffort(null, "aufwendig")).toBe("aufwendig");
    expect(settleEffort(null, "schnell")).toBe("schnell");
  });

  it("does not call quick what takes longer by its own printed time", () => {
    expect(settleEffort(45, "schnell")).toBe("alltag");
    expect(settleEffort(90, "schnell")).toBe("aufwendig");
    expect(settleEffort(90, "alltag")).toBe("aufwendig");
  });

  it("lets the estimate say that a short printed time is not the whole story", () => {
    // Twenty minutes of work and two hours in the oven.
    expect(settleEffort(20, "aufwendig")).toBe("aufwendig");
    expect(settleEffort(20, "schnell")).toBe("schnell");
  });
});

describe("tagsFromSuggestion", () => {
  it("collects the keys of everything suggested, the effort settled", () => {
    expect(
      tagsFromSuggestion(
        suggestion({
          dish: ["reis"],
          cuisine: "italienisch",
          seasons: ["herbst", "winter"],
          occasions: ["fuer-gaeste"],
        }),
        40,
      ),
    ).toEqual(["alltag", "reis", "italienisch", "herbst", "winter", "fuer-gaeste"]);
  });
});
