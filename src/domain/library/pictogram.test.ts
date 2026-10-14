import { describe, expect, it } from "vitest";
import { NO_FILTER } from "./filter";
import { PICTOGRAMS, pictogramFor, pictogramForFilter } from "./pictogram";
import { summary } from "./testing";

const of = (title: string, patch = {}) => pictogramFor(summary("r", { title, ...patch }));

describe("pictogramFor", () => {
  it("goes by the category where that says what the dish looks like", () => {
    expect(of("Kartoffelsuppe", { category: "suppe-eintopf" })).toBe("suppe");
    expect(of("Nudelsalat", { category: "salat" })).toBe("salat");
    expect(of("Marmorkuchen", { category: "kuchen" })).toBe("kuchen");
    expect(of("Paprika-Dip", { category: "grundrezept" })).toBe("dip");
  });

  it("goes by the kind of dish before what is in it", () => {
    expect(of("Lachs in Sahnesoße", { proteinType: "fish", tags: ["pasta"] })).toBe("pasta");
    expect(of("Spaghetti mit Lachs", { proteinType: "fish" })).toBe("pasta");
    expect(of("Käsespätzle")).toBe("pasta");
    expect(of("Überbackener Blumenkohl")).toBe("auflauf");
    expect(of("Hähnchen-Wraps", { proteinType: "poultry" })).toBe("burger");
    expect(of("Gemüse-Risotto")).toBe("reis");
  });

  it("falls back on what is in it", () => {
    expect(of("Zitronenhähnchen", { proteinType: "poultry" })).toBe("gefluegel");
    expect(of("Rinderrouladen", { proteinType: "red_meat" })).toBe("fleisch");
    expect(of("Gebratener Zander", { proteinType: "fish" })).toBe("fisch");
    expect(of("Ratatouille", { proteinType: "vegan" })).toBe("gemuese");
  });

  it("shows the vegetable a meatless dish is named after, where there is a picture of it", () => {
    expect(of("Pilze in Knoblauchsauce", { proteinType: "vegetarian" })).toBe("pilz");
    expect(of("Champignon-Pfanne", { proteinType: null })).toBe("pilz");
    expect(of("Gefüllte Tomaten", { proteinType: "vegan" })).toBe("tomate");
    // Meat and fish come first, and so does the kind of dish.
    expect(of("Hähnchen mit Champignons", { proteinType: "poultry" })).toBe("gefluegel");
    expect(of("Pilzrisotto", { proteinType: "vegetarian" })).toBe("reis");
    expect(of("Tomatensuppe", { proteinType: "vegetarian" })).toBe("suppe");
  });

  it("takes the dish a title names first, not its side", () => {
    const steak = "Steak mit Pfefferrahmsoße, Pilzen und Spätzle";
    expect(of(steak, { proteinType: "red_meat" })).toBe("fleisch");
    expect(of("Lachs mit Ofenkartoffeln", { proteinType: "fish" })).toBe("fisch");
    expect(of("Pilze mit Spätzle", { proteinType: "vegetarian" })).toBe("pilz");
    // Where the dish itself says nothing, the side still does better than a carrot.
    expect(of("Gemüsecurry mit Reis", { proteinType: "vegan" })).toBe("reis");
  });

  it("shows a plate when nothing is known", () => {
    expect(of("Überraschung", { proteinType: null, category: null })).toBe("teller");
  });
});

describe("pictogramForFilter", () => {
  const of = (patch = {}) => pictogramForFilter({ ...NO_FILTER, ...patch });

  it("has a picture for every category", () => {
    expect(of({ category: "hauptgericht" })).toBe("teller");
    expect(of({ category: "beilage" })).toBe("beilage");
    expect(of({ category: "suppe-eintopf" })).toBe("suppe");
    expect(of({ category: "kuchen" })).toBe("kuchen");
  });

  it("has a picture for the tags the app knows by key", () => {
    expect(of({ tags: ["schnell"] })).toBe("blitz");
    expect(of({ tags: ["aufwendig"] })).toBe("sanduhr");
    expect(of({ tags: ["pfanne"] })).toBe("pfanne");
    expect(of({ tags: ["deutsch"] })).toBe("brezel");
    expect(of({ tags: ["herbst"] })).toBe("pilz");
    expect(of({ tags: ["weihnachten"] })).toBe("tanne");
  });

  it("shows a tag the household made itself as a label", () => {
    expect(of({ tags: ["0f6f9f6e-0d4e-4a52-9a3a-2f1f1d1c7b11"] })).toBe("etikett");
  });

  it("has a picture for every diet and for a cookbook", () => {
    expect(of({ diet: "vegan" })).toBe("spross");
    expect(of({ diet: "fisch" })).toBe("fisch");
    expect(of({ book: "Speed Cooking" })).toBe("buch");
  });

  it("never names a picture that does not exist", () => {
    const keys = ["schnell", "alltag", "aufwendig", "pasta", "reis", "kartoffeln", "auflauf"];
    for (const key of [...keys, "pizza", "ofen", "burger", "mitnehmen", "grillen", "fest"]) {
      expect(PICTOGRAMS).toContain(of({ tags: [key] }));
    }
  });
});
