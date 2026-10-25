import { describe, expect, it } from "vitest";
import { mainIngredients } from "./main-ingredient";

const read = (title: string, ingredients: string[], category: string | null = "hauptgericht") =>
  mainIngredients({ title, category, ingredients });

describe("mainIngredients", () => {
  it("reads the meat and fish a dish is made of", () => {
    expect(read("Lasagne", ["Rinderhackfleisch", "Tomaten"])).toEqual(["hackfleisch"]);
    expect(read("Curry", ["Hähnchenbrustfilet", "Kokosmilch"])).toEqual(["haehnchen"]);
    expect(read("Gyros", ["Putenhack"])).toEqual(["hackfleisch"]);
    expect(read("Ofenlachs", ["Lachsfilet", "Zitronen"])).toEqual(["lachs"]);
    expect(read("Pfanne", ["Garnelen", "Knoblauch"])).toEqual(["garnelen"]);
    expect(
      read("Steak mit Pfefferrahmsoße, Pilzen und Spätzle", ["Rumpsteak", "Champignons"]),
    ).toEqual(["rind", "pilze"]);
    expect(read("Schnitzel", ["Schweineschnitzel", "Paniermehl"])).toEqual(["schwein"]);
    expect(read("Wiener Art", ["Putenschnitzel"])).toEqual(["haehnchen"]);
  });

  it("leaves out broths, fats and lookalikes", () => {
    expect(read("Risotto", ["Hühnerbrühe", "Reis"])).toEqual([]);
    expect(read("Suppe", ["Rinderbrühe", "Kalbsfond", "Gemüse"])).toEqual([]);
    expect(read("Fischstäbchen", ["Seelachsfilet"])).toEqual([]);
    expect(read("Salat", ["gehackte Tomaten", "Parmesanrinde"])).toEqual([]);
    expect(read("Tomatensalat", ["Ochsenherztomaten"])).toEqual([]);
    expect(read("Pilzgulasch mit Tagliatelle", ["Kräuterseitlinge"])).toEqual(["pilze"]);
    expect(read("Sellerieschnitzel", ["Knollensellerie"])).toEqual([]);
    expect(read("Nudeln", ["Speck", "Sahne"])).toEqual([]);
  });

  it("reads legumes, tofu and mushrooms", () => {
    expect(read("Dal", ["rote Linsen"])).toEqual(["huelsenfruechte"]);
    expect(read("Chili", ["Kidneybohnen", "Rinderhack"])).toEqual([
      "hackfleisch",
      "huelsenfruechte",
    ]);
    expect(read("Eintopf", ["weiße Bohnen"])).toEqual(["huelsenfruechte"]);
    expect(read("Bohnensalat", ["grüne Bohnen"])).toEqual([]);
    expect(read("Bowl", ["Räuchertofu"])).toEqual(["tofu"]);
    expect(read("Ragout", ["Kräuterseitlinge"])).toEqual(["pilze"]);
  });

  it("takes eggs and cheese from the title only", () => {
    expect(read("Pfannkuchen", ["Eier", "Mehl"])).toEqual([]);
    expect(read("Eier auf Gemüse", ["Eier", "Zucchini"])).toEqual(["eier"]);
    expect(read("Käsespätzle", ["Bergkäse", "Spätzle"])).toEqual(["kaese"]);
    expect(read("Pasta", ["Parmesan"])).toEqual([]);
  });

  it("says nothing of sweet things", () => {
    expect(read("Käsekuchen", ["Quark", "Eier"], "kuchen")).toEqual([]);
    expect(read("Bananen-Ingwer-Smoothie", ["Bananen"], "getraenk")).toEqual([]);
  });
});
