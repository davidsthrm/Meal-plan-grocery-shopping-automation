import { describe, expect, it } from "vitest";
import {
  cookingAmount,
  cookingNumber,
  scaleLine,
  scaleStep,
  stepIngredients,
  type StepIngredient,
  type StepPart,
} from "./scaling";

const known = (name: string, one: string = name, synonyms: string[] = []) => ({
  known: { name, synonyms: [one, ...synonyms].filter((n) => n !== name), one },
  originalText: "",
});

/** The ingredients of a made-up recipe: eggs, onions, tomatoes, garlic, flour, a seele. */
const INGREDIENTS: StepIngredient[] = stepIngredients([
  known("Eier", "Ei"),
  known("Zwiebeln", "Zwiebel"),
  known("Tomaten", "Tomate"),
  known("Knoblauch"),
  known("Mehl"),
  known("Salz"),
  known("Kartoffeln", "Kartoffel"),
  known("Zitronen", "Zitrone"),
  { known: null, originalText: "2 Stück Ingwer" },
  { known: null, originalText: "1 Seele" },
]);

/** The step as it reads, scaled amounts in brackets. */
function read(parts: StepPart[]): string {
  return parts.map((part) => (typeof part === "string" ? part : `[${part.text}]`)).join("");
}

const scaled = (text: string, factor: number) => read(scaleStep(text, factor, INGREDIENTS));

describe("scaleStep", () => {
  it("scales a count of an ingredient", () => {
    expect(scaled("2 Eier unterrühren.", 1.5)).toBe("[3] Eier unterrühren.");
  });

  it("keeps what was written for every scaled part", () => {
    expect(scaleStep("2 Eier unterrühren", 1.5, INGREDIENTS)).toEqual([
      { text: "3", original: "2" },
      " Eier unterrühren",
    ]);
  });

  it("changes nothing for a factor of 1", () => {
    expect(scaleStep("200 g Mehl sieben", 1, INGREDIENTS)).toEqual(["200 g Mehl sieben"]);
  });

  it("scales weights and volumes whatever follows them", () => {
    expect(scaled("200 g Mehl und 250 ml Milch verrühren", 1.5)).toBe(
      "[300] g Mehl und [380] ml Milch verrühren",
    );
    expect(scaled("Die restlichen 2 EL davon unterheben", 2)).toBe(
      "Die restlichen [4] EL davon unterheben",
    );
    expect(scaled("Mit 1 l Wasser aufgießen", 1.5)).toBe("Mit [1,5] l Wasser aufgießen");
    expect(scaled("0,75 kg Kartoffeln schälen", 1.5)).toBe("[1,15] kg Kartoffeln schälen");
  });

  it("reads a unit glued to its number", () => {
    expect(scaled("200g Mehl", 2)).toBe("[400]g Mehl");
  });

  it("reads fractions, as signs and with a slash", () => {
    expect(scaled("½ TL Salz dazugeben", 2)).toBe("[1] TL Salz dazugeben");
    expect(scaled("1½ EL Öl erhitzen", 2)).toBe("[3] EL Öl erhitzen");
    expect(scaled("1/2 TL Salz", 3)).toBe("[1½] TL Salz");
    expect(scaled("1 1/2 l Brühe", 2)).toBe("[3] l Brühe");
    expect(scaled("¼ TL Muskat", 1.5)).toBe("[½] TL Muskat");
  });

  it("reads German decimals and thousands", () => {
    expect(scaled("1,5 kg Kartoffeln kochen", 2)).toBe("[3] kg Kartoffeln kochen");
    expect(scaled("1.000 ml Brühe angießen", 0.5)).toBe("[500] ml Brühe angießen");
  });

  it("scales both ends of a range", () => {
    expect(scaled("2–3 Tomaten würfeln", 2)).toBe("[4–6] Tomaten würfeln");
    expect(scaled("2-3 Tomaten würfeln", 2)).toBe("[4-6] Tomaten würfeln");
    expect(scaled("2 bis 3 EL Zucker", 2)).toBe("[4 bis 6] EL Zucker");
  });

  it("keeps a range that rounds to one number as one number, in the singular", () => {
    expect(scaled("1-2 Prisen Salz", 0.25)).toBe("[1 Prise] Salz");
  });

  it("reads numbers written out", () => {
    expect(scaled("Zwei Eier trennen", 2)).toBe("[4] Eier trennen");
    expect(scaled("zweimal umrühren", 2)).toBe("zweimal umrühren");
  });

  it("scales a counted unit only with an ingredient behind it", () => {
    expect(scaled("2 Zehen Knoblauch hacken", 2)).toBe("[4] Zehen Knoblauch hacken");
    expect(scaled("Den Ingwer in 2 Stücke schneiden", 2)).toBe("Den Ingwer in 2 Stücke schneiden");
    expect(scaled("2 Stück Ingwer schälen", 2)).toBe("[4] Stück Ingwer schälen");
  });

  it("says a counted unit in the singular or the plural as the number needs", () => {
    expect(scaled("1 Zehe Knoblauch pressen", 2)).toBe("[2 Zehen] Knoblauch pressen");
    expect(scaled("2 Zehen Knoblauch pressen", 0.5)).toBe("[1 Zehe] Knoblauch pressen");
    expect(scaled("1 Dose Tomaten dazugeben", 2)).toBe("[2 Dosen] Tomaten dazugeben");
    expect(scaled("1 Prise Salz", 2)).toBe("[2 Prisen] Salz");
  });

  it("keeps an abbreviated unit as it is", () => {
    expect(scaled("1 Pck. Zitronen unterheben", 2)).toBe("[2 Pck.] Zitronen unterheben");
  });

  it("says the ingredient in the singular or the plural where the catalog knows both", () => {
    expect(scaled("1 Ei verquirlen", 3)).toBe("[3 Eier] verquirlen");
    expect(scaled("2 Eier verquirlen.", 0.5)).toBe("[1 Ei] verquirlen.");
    expect(scaled("1 Zwiebel würfeln", 2)).toBe("[2 Zwiebeln] würfeln");
  });

  it("leaves the amount as written where the noun's other form is not known", () => {
    expect(scaled("1 Seele aufschneiden", 2)).toBe("1 Seele aufschneiden");
    expect(scaled("2 Seelen aufschneiden", 1.5)).toBe("[3] Seelen aufschneiden");
  });

  it("scales past words that describe the ingredient", () => {
    expect(scaled("2 große Zwiebeln würfeln", 2)).toBe("[4] große Zwiebeln würfeln");
    expect(scaled("1 Dose gehackte Tomaten", 2)).toBe("[2 Dosen] gehackte Tomaten");
  });

  it("leaves it where a describing word would have to change its ending", () => {
    expect(scaled("1 großes Ei verquirlen", 2)).toBe("1 großes Ei verquirlen");
  });

  it("finds an ingredient by its singular, its plural and as part of a compound", () => {
    expect(scaled("3 Tomate halbieren", 2)).toBe("[6] Tomate halbieren");
    expect(scaled("4 Cocktailtomaten halbieren", 2)).toBe("[8] Cocktailtomaten halbieren");
  });

  it("leaves times, temperatures and sizes alone", () => {
    const text =
      "Bei 180 °C 20 Min. backen, 2-3 Minuten ruhen lassen und in einer Form (Ø 26 cm) servieren";
    expect(scaled(text, 2)).toBe(text);
    expect(scaled("In 2 cm große Würfel schneiden", 2)).toBe("In 2 cm große Würfel schneiden");
    expect(scaled("1 Std. 30 Min. schmoren", 2)).toBe("1 Std. 30 Min. schmoren");
  });

  it("leaves an amount for every piece alone", () => {
    expect(scaled("Mit je 1 Scheibe Zitrone belegen", 2)).toBe("Mit je 1 Scheibe Zitrone belegen");
    expect(scaled("Jeweils 1 Scheibe Zitrone auflegen", 2)).toBe(
      "Jeweils 1 Scheibe Zitrone auflegen",
    );
    expect(scaled("4 Kartoffeln à 150 g", 1.5)).toBe("[6] Kartoffeln à 150 g");
  });

  it("reads past adjectives only", () => {
    expect(scaled("4 Scheiben mit Tomaten belegen", 2)).toBe("4 Scheiben mit Tomaten belegen");
    expect(scaled("2 frisch gehackte Zwiebeln", 2)).toBe("2 frisch gehackte Zwiebeln");
  });

  it("leaves a share of something alone", () => {
    expect(scaled("⅔ der Tomaten unterheben", 1.5)).toBe("⅔ der Tomaten unterheben");
    expect(scaled("¼ vom Mehl zurückbehalten", 2)).toBe("¼ vom Mehl zurückbehalten");
  });

  it("leaves a size or a time alone, also before an ingredient's word", () => {
    const withCubes = stepIngredients([{ known: null, originalText: "100 g Speckwürfel" }]);
    expect(read(scaleStep("In 2 cm große Würfel schneiden", 2, withCubes))).toBe(
      "In 2 cm große Würfel schneiden",
    );
    expect(read(scaleStep("Die Würfel in 2 Würfel teilen", 2, withCubes))).toBe(
      "Die Würfel in 2 Würfel teilen",
    );
    const oldRolls = stepIngredients([{ known: null, originalText: "6 Semmeln, 1 Tag alt" }]);
    expect(read(scaleStep("1-2 Tag alte Semmeln", 1.5, oldRolls))).toBe("1-2 Tag alte Semmeln");
  });

  it("leaves the tins and forms a recipe greases alone", () => {
    const greased = stepIngredients([
      { known: null, originalText: "Butter für die Auflaufformen" },
      { known: null, originalText: "Fett für die Muffinform" },
      { known: null, originalText: "1 Springform" },
    ]);
    expect(read(scaleStep("Vier kleine Auflaufformen fetten", 2, greased))).toBe(
      "Vier kleine Auflaufformen fetten",
    );
    expect(read(scaleStep("Die Böden von 2 Springformen auslegen", 2, greased))).toBe(
      "Die Böden von 2 Springformen auslegen",
    );
    expect(read(scaleStep("Eine 6er-Muffinform fetten", 2, greased))).toBe(
      "Eine 6er-Muffinform fetten",
    );
  });

  it("leaves numbers that count no ingredient alone", () => {
    expect(scaled("In 4 Portionen teilen", 2)).toBe("In 4 Portionen teilen");
    expect(scaled("Auf 2 Teller verteilen", 2)).toBe("Auf 2 Teller verteilen");
    expect(scaled("Schritt 2. Den Teig kneten", 2)).toBe("Schritt 2. Den Teig kneten");
    expect(scaled("2x umrühren", 2)).toBe("2x umrühren");
    expect(scaled("Auf Stufe 3 mixen", 2)).toBe("Auf Stufe 3 mixen");
  });

  it("leaves numbers inside words, codes and other numbers alone", () => {
    expect(scaled("Heft 06/2020, Seite 12", 2)).toBe("Heft 06/2020, Seite 12");
    expect(scaled("2.5 g Hefe", 2)).toBe("2.5 g Hefe");
  });

  it("rounds to what a cook measures", () => {
    expect(scaled("2 Eier", 4 / 3)).toBe("[3] Eier");
    expect(scaled("2 Eier", 2 / 3)).toBe("[1 Ei]");
    expect(scaled("100 g Mehl", 4 / 3)).toBe("[130] g Mehl");
    expect(scaled("100 g Mehl", 2 / 3)).toBe("[65] g Mehl");
    expect(scaled("1 EL Öl", 4 / 3)).toBe("[1½] EL Öl");
  });

  it("does not mark an amount that comes out as written", () => {
    expect(scaleStep("1 Prise Salz", 1.2, INGREDIENTS)).toEqual(["1 Prise Salz"]);
  });

  it("scales several amounts in one step", () => {
    expect(scaled("2 Eier mit 100 g Mehl und 1 Prise Salz verrühren.", 2)).toBe(
      "[4] Eier mit [200] g Mehl und [2 Prisen] Salz verrühren.",
    );
  });
});

describe("cookingAmount", () => {
  it("rounds weights to a readable step", () => {
    expect(cookingAmount(66.67, "g")).toBe(65);
    expect(cookingAmount(133.33, "g")).toBe(130);
    expect(cookingAmount(333.3, "g")).toBe(330);
    expect(cookingAmount(7.5, "g")).toBe(8);
    expect(cookingAmount(1125, "ml")).toBe(1150);
    expect(cookingAmount(1.125, "kg")).toBe(1.15);
  });

  it("rounds spoons to halves, and to a printed fraction below one", () => {
    expect(cookingAmount(1.33, "EL")).toBe(1.5);
    expect(cookingAmount(0.375, "TL")).toBe(0.5);
    expect(cookingAmount(0.2, "TL")).toBe(0.25);
    expect(cookingAmount(0.1, "TL")).toBe(0.125);
  });

  it("counts pieces whole, a printed fraction below one", () => {
    expect(cookingAmount(1.33, null)).toBe(1);
    expect(cookingAmount(2.5, "Stück")).toBe(3);
    expect(cookingAmount(0.33, null)).toBe(1 / 3);
    expect(cookingAmount(0.1875, null)).toBe(0.25);
    expect(cookingAmount(0.1, "Zehe")).toBe(0.125);
  });

  it("never rounds a pinch away", () => {
    expect(cookingAmount(0.25, "Prise")).toBe(1);
  });
});

describe("cookingNumber", () => {
  it("writes numbers as a cookbook prints them", () => {
    expect(cookingNumber(3)).toBe("3");
    expect(cookingNumber(0.5)).toBe("½");
    expect(cookingNumber(1.5)).toBe("1½");
    expect(cookingNumber(0.25)).toBe("¼");
    expect(cookingNumber(0.125)).toBe("⅛");
    expect(cookingNumber(1 / 3)).toBe("⅓");
    expect(cookingNumber(1.15)).toBe("1,15");
    expect(cookingNumber(1.5, "l")).toBe("1,5");
    expect(cookingNumber(1.5, "EL")).toBe("1½");
  });
});

describe("stepIngredients", () => {
  it("takes the nouns of a printed line the catalog does not know, not its units", () => {
    expect(stepIngredients([{ known: null, originalText: "1 Dose Kidneybohnen" }])).toEqual([
      { names: ["Kidneybohnen"] },
    ]);
  });

  it("knows both words of a known ingredient where they differ", () => {
    expect(stepIngredients([known("Eier", "Ei")])[0]).toMatchObject({ one: "Ei", many: "Eier" });
    expect(stepIngredients([known("Mehl")])[0]).not.toHaveProperty("one");
  });
});

describe("scaleLine", () => {
  it("scales a line and rounds it as a cook measures", () => {
    expect(scaleLine(200, null, "g", 4 / 3)).toEqual({ quantity: 270, quantityMax: null });
    expect(scaleLine(2, null, "Stück", 1.5)).toEqual({ quantity: 3, quantityMax: null });
  });

  it("scales both ends of a range, and keeps one number where they meet", () => {
    expect(scaleLine(2, 3, "Stück", 2)).toEqual({ quantity: 4, quantityMax: 6 });
    expect(scaleLine(1, 2, "Prise", 0.25)).toEqual({ quantity: 1, quantityMax: null });
  });

  it("leaves a line without an amount, and any line at a factor of 1", () => {
    expect(scaleLine(null, null, null, 2)).toEqual({ quantity: null, quantityMax: null });
    expect(scaleLine(133.3, null, "g", 1)).toEqual({ quantity: 133.3, quantityMax: null });
  });
});
