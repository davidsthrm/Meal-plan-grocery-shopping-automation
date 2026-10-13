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
