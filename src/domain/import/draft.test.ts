import { describe, expect, it } from "vitest";
import { seedCatalog } from "../../../supabase/seed/catalog";
import { seedRecipes } from "../../../supabase/seed/recipes";
import fixtures from "../../../tests/fixtures/sample-week/recipes.json";
import { createCatalogIndex } from "../catalog";
import { checkDraft } from "./checks";
import { stalksAsStaengel, toDraft } from "./draft";
import type { ExtractedRecipe } from "./extraction";
import { mapToCatalog, sameProductName, wholeOfCut } from "./map-ingredient";
import type { ExpectedRecipe } from "./score";
import { flawless } from "./testing";

const index = createCatalogIndex(seedCatalog);
const expected = fixtures.recipes as ExpectedRecipe[];
const reading = (id: string): ExtractedRecipe => flawless(expected.find((r) => r.id === id)!);

describe("mapToCatalog", () => {
  const map = (raw: string, name: string) => mapToCatalog(index, { raw, name })?.id ?? null;

  it("prefers the longest part of the printed line that the catalog knows", () => {
    expect(map("1 getrocknete Chilischote", "Chilischote")).toBe("getrocknete-chilischoten");
    expect(map("1 Chilischote", "Chilischote")).toBe("chilischoten");
    expect(map("1 Dose gehackte Tomaten", "Tomaten")).toBe("gehackte-tomaten");
    expect(map("4 TL eingelegter grüner Pfeffer", "grüner Pfeffer")).toBe("gruener-pfeffer");
  });

  it("does not join words that are not next to each other", () => {
    expect(map("2 kleine, feste Tomaten", "Tomaten")).toBe("tomaten");
  });

  it("tells apart two ingredients printed on one line", () => {
    expect(map("Salz, Pfeffer", "Salz")).toBe("salz");
    expect(map("Salz, Pfeffer", "Pfeffer")).toBe("pfeffer");
  });

  it("uses synonyms", () => {
    expect(map("2 Möhren (etwa 200 g)", "Möhren")).toBe("karotten");
    expect(map("Kirschtomaten 100 g", "Kirschtomaten")).toBe("kleine-tomaten");
  });

  it("finds singular and plural forms and ignores 'Bio-'", () => {
    expect(map("2 Lachsfilets", "Lachsfilets")).toBe("lachsfilet");
    expect(map("1 Bio-Gurke", "Bio-Gurke")).toBe("gurken");
    expect(map("1 Bio-Orange", "Bio-Orange")).toBe("orangen");
    expect(map("2 Tortilla-Wrap", "Tortilla-Wrap")).toBe("wraps");
  });

  it("does not turn a short word into another one", () => {
    // "Ei" plus "s" would be ice cream, "Eis" minus "s" an egg.
    expect(map("1 Ei", "Ei")).toBe("eier");
    expect(map("500 g Eis", "Eis")).toBe("eis");
    expect(map("200 g Mais", "Mais")).toBe("mais");
  });

  it("returns null for an ingredient the catalog does not know", () => {
    expect(map("200 g Pak Choi", "Pak Choi")).toBeNull();
  });
});

describe("sameProductName", () => {
  it("treats plural forms and 'Bio-' as the same product", () => {
    expect(sameProductName("Forellenfilet", "Forellenfilets")).toBe(true);
    expect(sameProductName("weiße Zwiebel", "weiße Zwiebeln")).toBe(true);
    expect(sameProductName("Bio-Gurke", "Gurken")).toBe(true);
    expect(sameProductName("Fenchel", "Fladenbrot")).toBe(false);
    expect(sameProductName("Ei", "Eis")).toBe(false);
  });
});

describe("toDraft", () => {
  it("reproduces the hand-mapped seed recipes from a correct reading of the photos", () => {
    for (const seed of seedRecipes) {
      const draft = toDraft(reading(seed.sampleId), {}, index);
      const pick = (lines: typeof seed.ingredients) =>
        lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          quantityMax: l.quantityMax,
          unit: l.unit,
          approximate: l.approximate,
          secondary: l.secondary,
          alternativeTo: l.alternativeTo,
          optional: l.optional,
          originalText: l.originalText,
        }));
      expect(pick(draft.ingredients), seed.id).toEqual(pick(seed.ingredients));
      expect(draft.servings, seed.id).toEqual(seed.servings);
      expect(draft.sourcePage, seed.id).toBe(seed.sourcePage);
      expect(draft.prepMinutes, seed.id).toBe(seed.prepMinutes);
    }
  });

  it("takes what the household entered over what is missing on the photo", () => {
    const draft = toDraft(
      reading("IMG_5684"),
      { title: "Avocado Spaghetti", book: "Speed Cooking" },
      index,
    );
    expect(draft).toMatchObject({
      title: "Avocado Spaghetti",
      sourceTitle: null,
      sourceBook: "Speed Cooking",
      sourcePage: 97,
    });
  });

  it("keeps the printed title as the title when the household entered none", () => {
    const draft = toDraft(reading("IMG_5683"), { title: "  " }, index);
    expect(draft).toMatchObject({
      title: "Linsen-Eintopf",
      sourceTitle: "Linsen-Eintopf",
      sourceBook: null,
    });
  });

  it("stores what a recipe makes when its line does not count persons", () => {
    const cake = {
      ...reading("IMG_5682"),
      servingsMin: null,
      servingsMax: null,
      servingsRaw: "Zutaten für 1 Springform (Ø 26 cm)",
    };
    expect(toDraft(cake, {}, index).servings).toEqual({
      min: 1,
      max: 1,
      unit: "Springform (Ø 26 cm)",
    });
    const muffins = { ...cake, servingsMin: 12, servingsMax: 12, servingsRaw: "12 Muffins" };
    expect(toDraft(muffins, {}, index).servings).toEqual({ min: 12, max: 12, unit: "Muffins" });
  });

  it("keeps servings for persons as the model read them", () => {
    const stew = { ...reading("IMG_5683"), servingsRaw: "Für 4–6 Personen" };
    expect(toDraft(stew, {}, index).servings).toEqual({ min: 4, max: 6, unit: null });
  });

  it("leaves an unknown ingredient unmapped instead of picking something close", () => {
    const extracted = reading("IMG_5682");
    extracted.ingredients[0] = {
      ...extracted.ingredients[0],
      raw: "500 g Topinambur",
      name: "Topinambur",
    };
    const draft = toDraft(extracted, {}, index);
    expect(draft.ingredients[0]).toMatchObject({
      ingredientId: null,
      readName: "Topinambur",
      quantity: 500,
    });
  });
});

describe("checkDraft", () => {
  const check = (extracted: ExtractedRecipe, provided = {}) =>
    checkDraft(toDraft(extracted, provided, index), extracted);

  it("finds nothing wrong with a correct reading of the three titled sample recipes", () => {
    for (const id of ["IMG_5680", "IMG_5682", "IMG_5683"])
      expect(check(reading(id)), id).toEqual([]);
  });

  it("carries the steps of a correct reading into the draft without an issue", () => {
    const extracted = reading("IMG_5682");
    expect(toDraft(extracted, {}, index).steps).toHaveLength(7);
    expect(checkDraft(toDraft(extracted, {}, index), extracted, true)).toEqual([]);
  });

  it("sends steps with a gap, steps that break off or no steps at all to review", () => {
    const gap = reading("IMG_5683");
    gap.steps[3] = "Den Eintopf etwa […] Min. leise köchelnd garen.";
    expect(check(gap)).toEqual([{ code: "steps_unreadable", ingredientIndex: null, detail: "4" }]);

    // When the model said what it could not read, that is the one issue.
    gap.uncertain = [{ field: "steps", reason: "Schritt 4: Garzeit verdeckt" }];
    expect(check(gap).map((issue) => issue.code)).toEqual(["model_uncertain"]);

    const cut = reading("IMG_5683");
    cut.steps = cut.steps
      .slice(0, 1)
      .concat("Inzwischen den Ingwer schälen und fein hacken. Die Zwie-");
    expect(check(cut)).toEqual([{ code: "steps_cut_off", ingredientIndex: null, detail: "2" }]);

    const none = { ...reading("IMG_5683"), steps: [] };
    expect(checkDraft(toDraft(none, {}, index), none, true)).toEqual([
      { code: "steps_missing", ingredientIndex: null, detail: "" },
    ]);
    // A page without steps, by the first look or by not knowing, is no reason.
    expect(checkDraft(toDraft(none, {}, index), none, false)).toEqual([]);
    expect(check(none)).toEqual([]);
  });

  it("asks for a title when the photo has none and the household entered none", () => {
    expect(check(reading("IMG_5685"))).toEqual([
      {
        code: "title_missing",
        ingredientIndex: null,
        detail: "no title on the photos and none entered",
      },
    ]);
    expect(check(reading("IMG_5685"), { title: "Rustikaler Linsen Salat" })).toEqual([]);
  });

  it("does not hold a recipe back for an ingredient the catalog does not know", () => {
    const extracted = reading("IMG_5682");
    extracted.ingredients[0] = {
      ...extracted.ingredients[0],
      raw: "500 g Topinambur",
      name: "Topinambur",
    };
    expect(check(extracted)).toEqual([]);
  });

  it("does not hold a recipe back because its category is unclear", () => {
    const extracted = reading("IMG_5682");
    extracted.uncertain.push({
      field: "proteinType",
      reason: "Füllung der Nudeln nicht angegeben",
    });
    expect(check(extracted)).toEqual([]);
  });

  it("flags amounts that are far too large for the servings", () => {
    const extracted = reading("IMG_5682");
    extracted.ingredients[2].quantity = 100; // "1 EL Öl" misread as 100 EL
    extracted.ingredients[3].quantity = 34; // "¾ l" misread as 34 l
    expect(check(extracted).map((i) => [i.code, i.ingredientIndex])).toEqual([
      ["implausible_quantity", 2],
      ["implausible_quantity", 3],
    ]);
  });

  it("measures a recipe for one cake tin or tray by what such a recipe feeds", () => {
    const tray = {
      ...reading("IMG_5682"),
      servingsMin: null,
      servingsMax: null,
      servingsRaw: "Für 1 Blech",
    };
    // "500 g Kartoffeln" printed as 1.5 kg of plums: plenty for one person, normal for a tray.
    tray.ingredients[0] = { ...tray.ingredients[0], quantity: 1500, unit: "g" };
    expect(check(tray)).toEqual([]);
    // As a recipe for one person the same amount is a likely misreading.
    expect(
      check({ ...tray, servingsMin: 1, servingsMax: 1, servingsRaw: "Für 1 Person" }).map((i) => [
        i.code,
        i.ingredientIndex,
      ]),
    ).toEqual([["implausible_quantity", 0]]);
    // A misread amount is still caught on a tray.
    tray.ingredients[2] = { ...tray.ingredients[2], quantity: 100 }; // "1 EL Öl" as 100 EL
    expect(check(tray).map((i) => [i.code, i.ingredientIndex])).toEqual([
      ["implausible_quantity", 2],
    ]);
  });

  it("asks a person when a servings line is printed that the app cannot interpret", () => {
    const extracted = { ...reading("IMG_5682"), servingsRaw: "Springform 26 cm" };
    expect(check(extracted)).toEqual([
      { code: "servings_unclear", ingredientIndex: null, detail: "Springform 26 cm" },
    ]);
    // Without numbers from the model, the servings are missing as well.
    expect(
      check({ ...extracted, servingsMin: null, servingsMax: null }).map((i) => i.code),
    ).toEqual(["servings_missing", "servings_unclear"]);
  });

  it("passes on what the model itself was unsure about", () => {
    const extracted = reading("IMG_5683");
    extracted.uncertain.push({
      field: "Hühnerbrühe",
      reason: "Menge durch Lichtreflex nicht lesbar",
    });
    extracted.ingredients[7] = {
      ...extracted.ingredients[7],
      quantity: null,
      unit: null,
      unclear: true,
    };
    expect(check(extracted).map((i) => i.code)).toEqual(["model_uncertain", "unclear_line"]);
  });

  it("flags a range that does not go up and an alternative that points nowhere", () => {
    const extracted = reading("IMG_5683");
    extracted.ingredients[3].quantityMax = 2; // "2-3" read as "2-2"
    extracted.ingredients[4].alternativeTo = 99;
    expect(check(extracted).map((i) => i.code)).toEqual(["invalid_range", "invalid_alternative"]);
  });

  it("flags an amount whose unit the app does not know", () => {
    const extracted = reading("IMG_5682");
    // "1 Döschen Safran": a quantity, but no unit from the allowed list.
    extracted.ingredients[4] = {
      ...extracted.ingredients[4],
      raw: "1 Döschen Safran",
      name: "Salz",
      quantity: 1,
      unit: null,
    };
    expect(check(extracted)).toEqual([
      { code: "unit_missing", ingredientIndex: 4, detail: "1 Döschen Safran" },
    ]);
  });

  it("flags missing servings and an empty ingredient list", () => {
    const extracted = {
      ...reading("IMG_5680"),
      servingsMin: null,
      servingsMax: null,
      ingredients: [],
    };
    expect(check(extracted).map((i) => i.code)).toEqual(["servings_missing", "no_ingredients"]);
  });
});

describe("a part of something bought by the piece", () => {
  const drafted = (raw: string, name: string, quantity: number | null, unit: string | null) => {
    const base = reading(expected[0].id);
    const [first] = base.ingredients;
    const read = { ...first, raw, name, quantity, quantityMax: null, unit, note: "" };
    return toDraft({ ...base, ingredients: [read] }, {}, index).ingredients[0];
  };

  it("is the whole: lemon slices are slices of a lemon, an eighth is part of one", () => {
    expect(mapToCatalog(index, { raw: "2 Zitronenscheiben", name: "Zitronenscheiben" })?.id).toBe(
      "zitronen",
    );
    expect(drafted("2 Zitronenscheiben", "Zitronenscheiben", 2, "Stück")).toMatchObject({
      ingredientId: "zitronen",
      quantity: 2,
      unit: "Scheibe",
    });
    expect(drafted("2 Zitronenachtel", "Zitronenachtel", 2, "Stück")).toMatchObject({
      ingredientId: "zitronen",
      quantity: 0.25,
      unit: "Stück",
    });
    expect(
      drafted("Orangenscheiben zum Garnieren", "Bio-Orangenscheiben", null, null),
    ).toMatchObject({ ingredientId: "orangen", quantity: null, unit: null });
  });

  it("leaves a product sold in slices or halves alone", () => {
    expect(wholeOfCut(index, "Pfirsichhälften")).toBeNull();
    expect(mapToCatalog(index, { raw: "4 Toastscheiben", name: "Toastscheiben" })?.id).toBe(
      "toast",
    );
    expect(mapToCatalog(index, { raw: "2 Käsescheiben", name: "Käsescheiben" })?.id).toBe(
      "gouda-scheiben",
    );
  });
});

describe("stalksAsStaengel", () => {
  const stalks = (raw: string, unit: string | null, note: string | null, quantity = 3) =>
    stalksAsStaengel({ raw, quantity, unit, note });

  it("counts a line printed in stalks in Stängel and keeps the word out of its note", () => {
    expect(stalks("3 Stiele Thymian", "Stück", "Stiele")).toMatchObject({
      unit: "Stängel",
      note: null,
    });
    expect(stalks("4 Stiele glatte Petersilie", "Stängel", "glatte Stiele")).toMatchObject({
      note: "glatte",
    });
    expect(stalks("je 2 Stiele Rosmarin und Thymian", null, "je 2 Stiele")).toMatchObject({
      unit: "Stängel",
      note: null,
    });
    expect(stalks("Blätter von 8 Stielen Minze", "Stängel", "Blätter")).toMatchObject({
      note: "Blätter",
    });
    expect(stalks("1 Stiel Koriander", null, null, 1)).toMatchObject({ unit: "Stängel" });
    // What the reading said about the unit goes too.
    expect(stalks("4 Stiele Thymian", "Stängel", "gedruckt als Stiele")).toMatchObject({
      note: null,
    });
    expect(stalks("2 Stiele Dill", "Stängel", "Stiele (Einheit nicht in der Liste)")).toMatchObject(
      { note: null },
    );
  });

  it("leaves other lines alone", () => {
    const artichokes = { raw: "8 Stiel-Artischocken", quantity: 8, unit: "Stück", note: null };
    expect(stalksAsStaengel(artichokes)).toEqual(artichokes);
    const parsley = {
      raw: "½ Bund Petersilie, ohne Stiele",
      quantity: 0.5,
      unit: "Bund",
      note: "ohne Stiele",
    };
    expect(stalksAsStaengel(parsley)).toEqual(parsley);
    const herbs = {
      raw: "5 – 6 Stiele Möhrengrün oder 1 EL Gartenkräuter",
      quantity: 1,
      unit: "EL",
      note: "TK",
    };
    expect(stalksAsStaengel(herbs)).toEqual(herbs);
  });
});
