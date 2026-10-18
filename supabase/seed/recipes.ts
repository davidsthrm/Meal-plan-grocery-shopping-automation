import type { Recipe, RecipeIngredient, SecondaryMeasure } from "@/domain/recipe";
import type { Unit } from "@/domain/units";

/**
 * Seed recipes: the five sample recipes, mapped by hand to the catalog. The printed lines
 * come from tests/fixtures/sample-week/recipes.json and stay untouched in `originalText`.
 */

export type ProteinType = "red_meat" | "poultry" | "fish" | "vegetarian" | "vegan" | "none";

export interface SeedTag {
  id: string;
  name: string;
  group: string;
}

export interface SeedRecipe extends Recipe {
  /** Photo this recipe was read from, as in the fixtures. */
  sampleId: string;
  /** Title as printed. Null when it was not on the photographed page. */
  sourceTitle: string | null;
  sourceBook: string | null;
  sourcePage: number | null;
  prepMinutes: number | null;
  proteinType: ProteinType;
  tagIds: string[];
  /** A recipe with an open question stays in the review queue. */
  status: "approved" | "needs_review";
}

/** The id doubles as the tag's stable key, which the import uses to assign categories. */
export const tags: SeedTag[] = [
  { id: "hauptgericht", name: "Hauptgericht", group: "Kategorie" },
  { id: "suppe-eintopf", name: "Suppe & Eintopf", group: "Kategorie" },
  { id: "salat", name: "Salat", group: "Kategorie" },
  { id: "beilage", name: "Beilage", group: "Kategorie" },
  { id: "vesper", name: "Vesper", group: "Kategorie" },
  { id: "snack", name: "Snack & Fingerfood", group: "Kategorie" },
  { id: "dessert", name: "Dessert & Süßspeise", group: "Kategorie" },
  { id: "kuchen", name: "Kuchen & Gebäck", group: "Kategorie" },
  { id: "plaetzchen", name: "Plätzchen & Kekse", group: "Kategorie" },
  { id: "fruehstueck", name: "Frühstück", group: "Kategorie" },
  { id: "getraenk", name: "Getränk", group: "Kategorie" },
  { id: "grundrezept", name: "Soße, Dip & Grundrezept", group: "Kategorie" },
  { id: "fleisch", name: "Fleisch", group: "Ernährung" },
  { id: "fisch", name: "Fisch", group: "Ernährung" },
  { id: "vegetarisch", name: "vegetarisch", group: "Ernährung" },
  { id: "vegan", name: "vegan", group: "Ernährung" },
  { id: "huelsenfruechte", name: "Hülsenfrüchte", group: "Ernährung" },
  // What a recipe is like beyond its category. The same list as in the migration that gives
  // these tags to the households that existed before it.
  { id: "schnell", name: "Schnell", group: "Aufwand" },
  { id: "alltag", name: "Alltagsküche", group: "Aufwand" },
  { id: "aufwendig", name: "Braucht Zeit", group: "Aufwand" },
  { id: "pasta", name: "Pasta & Nudeln", group: "Gericht" },
  { id: "reis", name: "Reis & Getreide", group: "Gericht" },
  { id: "kartoffeln", name: "Kartoffelgericht", group: "Gericht" },
  { id: "auflauf", name: "Auflauf & Gratin", group: "Gericht" },
  { id: "pizza", name: "Pizza, Quiche & Flammkuchen", group: "Gericht" },
  { id: "pfanne", name: "Pfannengericht", group: "Gericht" },
  { id: "ofen", name: "Aus dem Ofen", group: "Gericht" },
  { id: "burger", name: "Burger, Wraps & Sandwiches", group: "Gericht" },
  { id: "deutsch", name: "Deutsch & Schwäbisch", group: "Küche" },
  { id: "italienisch", name: "Italienisch", group: "Küche" },
  { id: "mediterran", name: "Mediterran", group: "Küche" },
  { id: "asiatisch", name: "Asiatisch", group: "Küche" },
  { id: "orientalisch", name: "Orientalisch", group: "Küche" },
  { id: "amerikanisch", name: "Amerikanisch & Tex-Mex", group: "Küche" },
  { id: "fruehling", name: "Frühling", group: "Saison" },
  { id: "sommer", name: "Sommer", group: "Saison" },
  { id: "herbst", name: "Herbst", group: "Saison" },
  { id: "winter", name: "Winter", group: "Saison" },
  { id: "fuer-gaeste", name: "Für Gäste", group: "Anlass" },
  { id: "fest", name: "Sonntag & Feiertag", group: "Anlass" },
  { id: "grillen", name: "Grillen", group: "Anlass" },
  { id: "mitnehmen", name: "Zum Mitnehmen", group: "Anlass" },
  { id: "weihnachten", name: "Weihnachten", group: "Anlass" },
];

interface LineExtra {
  max?: number;
  approx?: boolean;
  note?: string;
  secondary?: SecondaryMeasure;
  optional?: boolean;
  /** Index of the line this one may replace. */
  alternativeTo?: number;
}

function line(
  originalText: string,
  ingredientId: string,
  quantity: number | null = null,
  unit: Unit | null = null,
  extra: LineExtra = {},
): RecipeIngredient {
  return {
    ingredientId,
    quantity,
    quantityMax: extra.max ?? null,
    unit,
    approximate: extra.approx ?? false,
    secondary: extra.secondary ?? null,
    alternativeTo: extra.alternativeTo ?? null,
    optional: extra.optional ?? false,
    originalText,
    note: extra.note ?? null,
  };
}

// prettier-ignore
export const seedRecipes: SeedRecipe[] = [
  {
    id: "steak-pfefferrahm-spaetzle",
    sampleId: "IMG_5680",
    title: "Steak mit Pfefferrahmsoße, Pilzen und Spätzle",
    sourceTitle: "Steak mit Pfefferrahmsoße, Pilzen und Spätzle",
    kind: "cookbook",
    sourceBook: null,
    sourcePage: null,
    servings: { min: 4, max: 4, unit: null },
    prepMinutes: null,
    proteinType: "red_meat",
    tagIds: ["hauptgericht", "fleisch", "fuer-gaeste"],
    status: "approved",
    ingredients: [
      line("4 Rindersteaks, 2 cm dick, à 150 g", "rindersteaks", 4, "Stück", { note: "2 cm dick", secondary: { quantity: 150, unit: "g", scope: "perPiece" } }),
      line("250 g braune Champignons", "champignons", 250, "g", { note: "braune" }),
      line("200 g Kräuterseitlinge", "kraeuterseitlinge", 200, "g"),
      line("1 Knoblauchzehe", "knoblauch", 1, "Zehe"),
      line("500 g frische Spätzle", "spaetzle", 500, "g"),
      line("Salz, Pfeffer", "salz"),
      line("Salz, Pfeffer", "pfeffer"),
      line("3 EL Rapsöl", "rapsoel", 3, "EL"),
      line("½ TL Thymianblättchen", "thymian", 0.5, "TL"),
      line("70 ml Gemüsebrühe", "gemuesebruehe", 70, "ml"),
      line("150 ml Sahne", "sahne", 150, "ml"),
      line("4 TL eingelegter grüner Pfeffer", "gruener-pfeffer", 4, "TL"),
    ],
  },
  {
    id: "kartoffel-avocado-suppe",
    sampleId: "IMG_5682",
    title: "Kartoffel-Avocado-Suppe",
    sourceTitle: "Kartoffel-Avocado-Suppe",
    kind: "cookbook",
    sourceBook: null,
    sourcePage: 82,
    servings: { min: 4, max: 4, unit: null },
    prepMinutes: 45,
    proteinType: "vegan",
    tagIds: ["suppe-eintopf", "vegan"],
    status: "approved",
    ingredients: [
      line("500 g Kartoffeln (mehligkochende Sorte)", "kartoffeln", 500, "g", { note: "mehligkochende Sorte" }),
      line("1 mittelgroße Zwiebel", "zwiebeln", 1, "Stück", { note: "mittelgroße" }),
      line("1 EL Öl", "oel", 1, "EL"),
      line("¾ l milde Gemüsebrühe", "gemuesebruehe", 0.75, "l", { note: "milde" }),
      line("Salz", "salz"),
      line("schwarzer Pfeffer aus der Mühle", "pfeffer", null, null, { note: "aus der Mühle" }),
      line("1 EL frisches Koriandergrün (oder 2–3 EL gehackte Petersilie)", "koriander", 1, "EL", { note: "frisches" }),
      line("1 EL frisches Koriandergrün (oder 2–3 EL gehackte Petersilie)", "petersilie", 2, "EL", { max: 3, note: "gehackte", alternativeTo: 6 }),
      line("2 kleine, feste Tomaten", "tomaten", 2, "Stück", { note: "kleine, feste" }),
      line("1 reife Avocado", "avocados", 1, "Stück", { note: "reife" }),
      line("2 EL Zitronensaft", "zitronensaft", 2, "EL"),
    ],
  },
  {
    id: "linsen-eintopf",
    sampleId: "IMG_5683",
    title: "Linsen-Eintopf",
    sourceTitle: "Linsen-Eintopf",
    kind: "cookbook",
    sourceBook: null,
    sourcePage: 84,
    servings: { min: 4, max: 6, unit: null },
    prepMinutes: 75,
    proteinType: "red_meat",
    tagIds: ["suppe-eintopf", "huelsenfruechte"],
    status: "approved",
    ingredients: [
      line("300 g braune Linsen", "braune-linsen", 300, "g"),
      line("50 g durchwachsener Speck", "speck", 50, "g", { note: "durchwachsener" }),
      line("1 walnußgroßes Stückchen frischer Ingwer", "ingwer", 1, "Stück", { note: "walnußgroßes Stückchen" }),
      line("2–3 Frühlingszwiebeln", "fruehlingszwiebeln", 2, "Stück", { max: 3 }),
      line("2 El Öl", "oel", 2, "EL"),
      line("1 Knoblauchzehe", "knoblauch", 1, "Zehe"),
      line("etwa 100 ml Weißweinessig", "weissweinessig", 100, "ml", { approx: true }),
      line("1 ¼ l Hühnerbrühe", "huehnerbruehe", 1.25, "l"),
      line("1 getrocknete Chilischote", "getrocknete-chilischoten", 1, "Stück"),
      // The print does not say whether "(etwa 200 g)" is the total or per piece.
      line("2 Kartoffeln (etwa 200 g)", "kartoffeln", 2, "Stück", { secondary: { quantity: 200, unit: "g", scope: null } }),
      line("2 Möhren (etwa 200 g)", "karotten", 2, "Stück", { secondary: { quantity: 200, unit: "g", scope: null } }),
      line("Salz", "salz"),
      line("schwarzer Pfeffer aus der Mühle", "pfeffer", null, null, { note: "aus der Mühle" }),
      line("1 Bund Schnittlauch", "schnittlauch", 1, "Bund"),
    ],
  },
  {
    id: "avocado-spaghetti",
    sampleId: "IMG_5684",
    // The title is on the facing page, which was not photographed. The household named it.
    title: "Avocado Spaghetti",
    sourceTitle: null,
    kind: "cookbook",
    sourceBook: "Speed Cooking",
    sourcePage: 97,
    servings: { min: 2, max: 2, unit: null },
    prepMinutes: 20,
    proteinType: "vegetarian",
    tagIds: ["hauptgericht", "pasta", "vegetarisch", "schnell"],
    status: "approved",
    ingredients: [
      line("Spaghetti 200 g", "spaghetti", 200, "g"),
      line("Knoblauchzehe 1", "knoblauch", 1, "Zehe"),
      line("Basilikum 4 Stängel", "basilikum", 4, "Stängel"),
      line("Zitronensaft 3½ EL", "zitronensaft", 3.5, "EL"),
      line("Pinienkerne 1 EL", "pinienkerne", 1, "EL"),
      line("Olivenöl 2 EL", "olivenoel", 2, "EL"),
      line("Avocado ½", "avocados", 0.5, "Stück"),
      line("Schafskäse 50 g", "schafskaese", 50, "g"),
      line("Chiliflocken ¼ TL", "chiliflocken", 0.25, "TL", { optional: true }),
      line("Salz & Pfeffer", "salz"),
      line("Salz & Pfeffer", "pfeffer"),
    ],
  },
  {
    id: "rustikaler-linsen-salat",
    sampleId: "IMG_5685",
    // The title is on the facing page, which was not photographed. The household named it.
    title: "Rustikaler Linsen Salat",
    sourceTitle: null,
    kind: "cookbook",
    sourceBook: "Speed Cooking",
    sourcePage: 88,
    servings: { min: 2, max: 2, unit: null },
    prepMinutes: 15,
    proteinType: "red_meat",
    tagIds: ["salat", "huelsenfruechte", "schnell"],
    status: "approved",
    ingredients: [
      line("Kurzkoch-Linsen 2 Beutel (à 62 g)", "kurzkoch-linsen", 2, "Beutel", { secondary: { quantity: 62, unit: "g", scope: "perPiece" } }),
      line("Oliven (entsteint) 8", "oliven", 8, "Stück", { note: "entsteint" }),
      line("Mini-Salami 70 g", "mini-salami", 70, "g"),
      line("Mini-Mozzarella 100 g", "mini-mozzarella", 100, "g"),
      line("Kirschtomaten 100 g", "kleine-tomaten", 100, "g"),
      line("rote Zwiebel 1", "rote-zwiebeln", 1, "Stück"),
      line("Olivenöl 3 EL", "olivenoel", 3, "EL"),
      line("Aceto balsamico 1 EL", "balsamico", 1, "EL"),
      line("ital. TK-Kräuter 2 TL", "tk-kraeuter", 2, "TL"),
      line("Salz & Pfeffer", "salz"),
      line("Salz & Pfeffer", "pfeffer"),
    ],
  },
];
