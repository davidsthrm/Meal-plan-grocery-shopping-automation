import { describe, expect, it } from "vitest";
import { pictogramFor } from "./pictogram";
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
