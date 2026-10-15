import type { Servings } from "../recipe";
import { searchKey } from "./filter";
import type { ProteinType } from "./summary";
import { settleEffort } from "./tagging";
import { EFFORT_NAME, EFFORTS, type Effort } from "./tags";

/**
 * How far the fields a model assigned to a recipe can be trusted: its kind (meat, fish,
 * vegetarian), its category, its time and its servings. The import stores no confidence for
 * them, so each is compared with what else the recipe says: its ingredients and its title. A
 * fish recipe without any fish, a soup filed as a cake, a quick dish that prints 75 minutes.
 * Each finding has a weight; the recipes with the most weight are the least trustworthy and
 * are shown first. A field a person confirmed or set is not checked again.
 */

/** The fields that are checked, as they are stored in `recipe.checked_fields`. */
export const CHECKED_FIELDS = ["protein", "category", "time", "servings"] as const;
export type CheckedField = (typeof CHECKED_FIELDS)[number];

export function isCheckedField(value: string): value is CheckedField {
  return (CHECKED_FIELDS as readonly string[]).includes(value);
}

export const PROTEIN_NAME: Record<ProteinType, string> = {
  vegetarian: "Vegetarisch",
  vegan: "Vegan",
  fish: "Fisch",
  poultry: "Geflügel",
  red_meat: "Fleisch",
  none: "Ohne Hauptzutat",
};

export interface QualityRecipe {
  id: string;
  title: string;
  /** Key of its category tag. */
  category: string | null;
  proteinType: ProteinType | null;
  prepMinutes: number | null;
  servings: Servings | null;
  /** The tags that describe it, by key: its effort among them. */
  tags: readonly string[];
  /**
   * Its ingredients: the catalog's name where a line is mapped, the printed line otherwise.
   * Lines that are only an alternative to another one are left out.
   */
  ingredients: readonly string[];
  /** Fields a person has confirmed or set since the import. */
  checked: readonly CheckedField[];
}

export interface Finding {
  field: CheckedField;
  /** What does not fit, in a sentence. */
  text: string;
  /** How strongly it speaks against the field: 1 a hint, 5 almost certainly wrong. */
  weight: number;
  /**
   * A value that would fit, where one can be named: a protein type, a category key, an
   * effort key. Null when only a person can tell.
   */
  suggestion: string | null;
}

export interface RecipeCheck {
  recipe: QualityRecipe;
  findings: Finding[];
  /** The sum of the weights. */
  score: number;
}

/** The animal in an ingredient, and whether it is only a seasoning: a stock, a fish sauce. */
export interface AnimalPart {
  kind: "red_meat" | "poultry" | "fish";
  trace: boolean;
}

/** Heaviest first: a week counts a meal by its heaviest protein. */
const HEAVINESS: readonly AnimalPart["kind"][] = ["red_meat", "poultry", "fish"];

const FISH =
  /lachs|thunfisch|fisch|garnele|shrimp|scampi|krabbe|gamba|forelle|kabeljau|dorsch|zander|scholle|makrele|hering|matjes|sardelle|sardine|anchovi|muschel|calamar|pulpo|oktopus|hummer|languste|surimi|pangasius|tilapia|rotbarsch|heilbutt|dorade|saibling|karpfen|^kaviar|auster|meeresfrucht/;
const NOT_FISH = /lachsschinken|fischgewurz|austernpilz|muschelnudel/;
const POULTRY =
  /hahnchen|hahnch|huhn|huhner|hendl|pute|truthahn|gans(?!eblum)|gefluge|chicken|poulard|wachtel(?!ei)|^ente|ente$|entenbrust|entenkeule/;
const RED_MEAT =
  /rind|schwein|kalb|lamm|hackfleisch|hack$|^hack|gehacktes|speck|schinken|salami|wurst|wurstchen|leberkas|lyoner|chorizo|bacon|pancetta|prosciutto|serrano|kassler|kasseler|^mett|gulasch|hirsch|wildschwein|reh(rucken|keule|fleisch|gulasch)|kotelett|schnitzel|roastbeef|pastrami|tafelspitz|ochsen|cevapcici|frikadelle|bulette|haxe|cabanossi|mortadella|guanciale|lardo|fleisch|^steaks?$|rumpsteak|huftsteak|entrecote/;
/**
 * Words that look like meat and are not: bark of cheese, baking ammonia, a kind of tomato,
 * and dishes of vegetables named after meat (a mushroom goulash, a cauliflower steak).
 */
const NOT_MEAT =
  /rinde$|flamm|hirschhorn|ochsenherz|fleischtomate|fruchtfleisch|kokosfleisch|vegetarisch|vegan|veggie|(gemuse|pilz|linsen|kohlrabi|sellerie|blumenkohl|tofu|seitan|soja)(gulasch|schnitzel|schnetzel|steak|frikadelle|bulette|hack|wurst)/;
/** What is only a seasoning: it makes a dish not vegetarian, but it is not what it is about. */
const TRACE = /bruhe|fond|bouillon|schmalz|sauce|sosse|paste|gelatine|extrakt|aspik/;

/** Dairy, eggs and honey: not vegan. */
const ANIMAL_PRODUCT =
  /milch|butter|sahne|rahm|kase|quark|joghurt|jogurt|schmand|creme fraiche|mascarpone|mozzarella|parmesan|gouda|feta|ricotta|^eier?$|^eigelb|^eiweiss|^eiklar|honig|mayonnaise|kefir|molke|ghee/;
const PLANT_BASED =
  /kokos|hafer|mandel|soja|reismilch|erdnussbutter|kakaobutter|vegan|pflanzlich|nussbutter|butternut|butterbohne|honigmelone/;

/** The words of an ingredient's name, without the amount and the note after a comma. */
function nameWords(name: string): string[] {
  return keyWords(name.split(",")[0]);
}

/** The words of a text as the search compares them: without case, umlauts or hyphens. */
function keyWords(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map(searchKey)
    .filter(Boolean);
}

/** The animal an ingredient is from, or null for anything else. */
export function animalIn(name: string): AnimalPart | null {
  const words = nameWords(name);
  const whole = words.join(" ");
  if (NOT_MEAT.test(whole)) return null;
  const trace = words.some((word) => TRACE.test(word));
  const fits = (pattern: RegExp, unless?: RegExp) =>
    words.some((word) => pattern.test(word) && !unless?.test(word));
  // The animal the name is about: tuna steak is fish, turkey schnitzel poultry.
  if (fits(FISH, NOT_FISH)) return { kind: "fish", trace };
  if (fits(POULTRY)) return { kind: "poultry", trace };
  if (fits(RED_MEAT)) return { kind: "red_meat", trace };
  return null;
}

/** Whether an ingredient is dairy, egg or honey. */
export function isAnimalProduct(name: string): boolean {
  const words = nameWords(name);
  if (words.some((word) => PLANT_BASED.test(word))) return false;
  return words.some((word) => ANIMAL_PRODUCT.test(word));
}

/** What the ingredients say about the kind of a recipe. */
interface Evidence {
  /** The heaviest animal among the ingredients that are not only a seasoning. */
  main: AnimalPart["kind"] | null;
  /** The ingredients of each animal, as named. */
  named: Record<AnimalPart["kind"], string[]>;
  /** Stocks and sauces of an animal. */
  traces: string[];
  animalProducts: string[];
}

function evidenceOf(ingredients: readonly string[]): Evidence {
  const named: Evidence["named"] = { red_meat: [], poultry: [], fish: [] };
  const traces: string[] = [];
  const animalProducts: string[] = [];
  for (const ingredient of ingredients) {
    const label = ingredient.split(",")[0].trim();
    const animal = animalIn(ingredient);
    if (animal?.trace) traces.push(label);
    else if (animal) named[animal.kind].push(label);
    else if (isAnimalProduct(ingredient)) animalProducts.push(label);
  }
  const main = HEAVINESS.find((kind) => named[kind].length > 0) ?? null;
  return { main, named, traces, animalProducts };
}

/** "Speck, Hähnchenbrust und 2 weitere" */
function listed(names: readonly string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 2) return unique.join(" und ");
  return `${unique.slice(0, 2).join(", ")} und ${unique.length - 2} weitere`;
}

const ANIMAL_WORD: Record<AnimalPart["kind"], string> = {
  fish: "Fisch",
  poultry: "Geflügel",
  red_meat: "Fleisch",
};

function proteinFindings(recipe: QualityRecipe): Finding[] {
  const declared = recipe.proteinType;
  // A recipe without ingredient lines says nothing about its kind.
  if (recipe.ingredients.length === 0) return [];
  const evidence = evidenceOf(recipe.ingredients);
  const fitting = evidence.main ?? "vegetarian";
  if (declared === null) {
    return [
      {
        field: "protein",
        text: "Nicht eingetragen, ob mit Fleisch, Fisch oder vegetarisch.",
        weight: 3,
        suggestion: fitting,
      },
    ];
  }
  if (declared === "vegetarian" || declared === "vegan") {
    if (evidence.main) {
      return [
        {
          field: "protein",
          text: `Als ${PROTEIN_NAME[declared].toLowerCase()} eingetragen, enthält aber ${listed(evidence.named[evidence.main])}.`,
          weight: 5,
          suggestion: evidence.main,
        },
      ];
    }
    if (evidence.traces.length > 0) {
      return [
        {
          field: "protein",
          text: `Als ${PROTEIN_NAME[declared].toLowerCase()} eingetragen, enthält aber ${listed(evidence.traces)}.`,
          weight: 2,
          suggestion: null,
        },
      ];
    }
    if (declared === "vegan" && evidence.animalProducts.length > 0) {
      return [
        {
          field: "protein",
          text: `Als vegan eingetragen, enthält aber ${listed(evidence.animalProducts)}.`,
          weight: 3,
          suggestion: "vegetarian",
        },
      ];
    }
    return [];
  }
  if (declared === "none") {
    if (!evidence.main) return [];
    return [
      {
        field: "protein",
        text: `Ohne Hauptzutat eingetragen, enthält aber ${listed(evidence.named[evidence.main])}.`,
        weight: 3,
        suggestion: evidence.main,
      },
    ];
  }
  // Fish, poultry or meat.
  if (evidence.named[declared].length === 0) {
    const other = evidence.main ? `; enthält ${listed(evidence.named[evidence.main])}` : "";
    return [
      {
        field: "protein",
        text: `Als ${PROTEIN_NAME[declared]} eingetragen, aber kein ${ANIMAL_WORD[declared]} unter den Zutaten${other}.`,
        weight: evidence.main ? 4 : 5,
        suggestion: fitting,
      },
    ];
  }
  if (evidence.main && HEAVINESS.indexOf(evidence.main) < HEAVINESS.indexOf(declared)) {
    return [
      {
        field: "protein",
        text: `Als ${PROTEIN_NAME[declared]} eingetragen, enthält aber auch ${listed(evidence.named[evidence.main])}. Die Woche zählt das Schwerere.`,
        weight: 2,
        suggestion: evidence.main,
      },
    ];
  }
  return [];
}

/** The words of the part of a title that names the dish: "Steak mit Spätzle" is a steak. */
function headWords(title: string): string[] {
  return keyWords(title.split(/,|\s(?:mit|an|auf|dazu|und)\s/i)[0]);
}

/** Savoury things that are called a cake. */
const SAVOURY_CAKE =
  /flammkuchen|zwiebelkuchen|pfannkuchen|reibekuchen|kartoffelkuchen|lauchkuchen|speckkuchen|fleischkuchen|fischkuchen/;
const CAKE_WORD =
  /kuchen$|(torte|torten|tortchen)$|^muffins?$|^brownies?$|platzchen$|^kekse?$|^cookies?$|cheesecake|cupcakes?$|makronen$|lebkuchen|stollen$|schnecken$/;
const DESSERT_WORD = /tiramisu|mousse|pudding$|^cotta$|sorbet|kompott$|crumble$|^brulee$/;
const SOUP_WORD = /suppe$|suppen$|eintopf$|minestrone|gazpacho|borschtsch|^ramen$|^pho$/;
const SALAD_WORD = /salat$/;

const SWEET_CATEGORIES = new Set(["kuchen", "dessert"]);
/** Where something sweet may be filed besides cakes and desserts. */
const SWEET_ALLOWED = new Set(["kuchen", "dessert", "fruehstueck", "snack", "getraenk"]);
const SOUP_ALLOWED = new Set(["suppe-eintopf", "grundrezept"]);
const SALAD_ALLOWED = new Set(["salat", "beilage", "vesper", "hauptgericht", "dessert"]);

/** What the title says the category is, if it says so clearly. */
function categoryFromTitle(title: string): string | null {
  const words = headWords(title);
  const has = (pattern: RegExp) => words.some((word) => pattern.test(word));
  if (words.some((word) => SAVOURY_CAKE.test(word))) return null;
  if (has(SOUP_WORD)) return "suppe-eintopf";
  if (has(CAKE_WORD)) return "kuchen";
  if (has(DESSERT_WORD)) return "dessert";
  if (has(SALAD_WORD)) return "salat";
  return null;
}

function categoryFindings(recipe: QualityRecipe, categoryName: (key: string) => string): Finding[] {
  const fromTitle = categoryFromTitle(recipe.title);
  const category = recipe.category;
  if (category === null) {
    return [
      {
        field: "category",
        text: "Keine Kategorie eingetragen.",
        weight: 2,
        suggestion: fromTitle,
      },
    ];
  }
  const named = categoryName(category);
  // Meat or fish in a cake or a drink: a quiche with bacon filed as a cake.
  if (SWEET_CATEGORIES.has(category) || category === "getraenk") {
    const evidence = evidenceOf(recipe.ingredients);
    if (evidence.main) {
      return [
        {
          field: "category",
          text: `Als ${named} eingetragen, enthält aber ${listed(evidence.named[evidence.main])}.`,
          weight: 4,
          suggestion: fromTitle && !SWEET_CATEGORIES.has(fromTitle) ? fromTitle : "hauptgericht",
        },
      ];
    }
  }
  if (fromTitle === "suppe-eintopf" && !SOUP_ALLOWED.has(category)) {
    return [
      {
        field: "category",
        text: `Der Titel nennt eine Suppe, eingetragen ist ${named}.`,
        weight: 3,
        suggestion: fromTitle,
      },
    ];
  }
  if ((fromTitle === "kuchen" || fromTitle === "dessert") && !SWEET_ALLOWED.has(category)) {
    return [
      {
        field: "category",
        text: `Der Titel nennt etwas Süßes, eingetragen ist ${named}.`,
        weight: 3,
        suggestion: fromTitle,
      },
    ];
  }
  if (fromTitle === "salat" && !SALAD_ALLOWED.has(category)) {
    return [
      {
        field: "category",
        text: `Der Titel nennt einen Salat, eingetragen ist ${named}.`,
        weight: 2,
        suggestion: fromTitle,
      },
    ];
  }
  return [];
}

/** Printed times outside this range are a misreading rather than a recipe. */
const FEWEST_MINUTES = 5;
const MOST_MINUTES = 8 * 60;

function timeFindings(recipe: QualityRecipe): Finding[] {
  const minutes = recipe.prepMinutes;
  const effort = EFFORTS.find((key) => recipe.tags.includes(key)) ?? null;
  if (minutes !== null && (minutes < FEWEST_MINUTES || minutes > MOST_MINUTES)) {
    return [
      {
        field: "time",
        text: `${minutes} Minuten Zubereitungszeit: wohl falsch gelesen.`,
        weight: 3,
        suggestion: null,
      },
    ];
  }
  if (minutes !== null && effort !== null) {
    const settled = settleEffort(minutes, effort);
    if (settled !== effort) {
      return [
        {
          field: "time",
          text: `Als „${EFFORT_NAME[effort]}“ eingetragen, das Rezept nennt aber ${minutes} Minuten.`,
          weight: 2,
          suggestion: settled,
        },
      ];
    }
  }
  if (minutes === null && effort === null) {
    return [
      {
        field: "time",
        text: "Weder Zeit noch Aufwand bekannt: wird nur fürs Wochenende vorgeschlagen.",
        weight: 1,
        suggestion: null,
      },
    ];
  }
  return [];
}

/** More persons than this is more likely pieces or a tray read as persons. */
const MOST_PERSONS = 12;

function servingsFindings(recipe: QualityRecipe): Finding[] {
  const servings = recipe.servings;
  if (servings === null) {
    return [
      { field: "servings", text: "Keine Portionen eingetragen.", weight: 4, suggestion: null },
    ];
  }
  if (servings.unit !== null) return [];
  if (servings.max > MOST_PERSONS) {
    return [
      {
        field: "servings",
        text: `Für ${servings.max} Personen: vermutlich Stück oder eine Form.`,
        weight: 3,
        suggestion: null,
      },
    ];
  }
  if (recipe.category === "kuchen") {
    return [
      {
        field: "servings",
        text: `Ein Kuchen für ${servings.min === servings.max ? servings.min : `${servings.min}–${servings.max}`} Personen: Was ergibt das Rezept, eine Springform, ein Blech?`,
        weight: 3,
        suggestion: null,
      },
    ];
  }
  return [];
}

/**
 * What does not fit about one recipe. `categoryName` gives the household's name for a
 * category key.
 */
export function checkRecipe(
  recipe: QualityRecipe,
  categoryName: (key: string) => string = (key) => key,
): RecipeCheck {
  const findings = [
    ...proteinFindings(recipe),
    ...categoryFindings(recipe, categoryName),
    ...timeFindings(recipe),
    ...servingsFindings(recipe),
  ].filter((finding) => !recipe.checked.includes(finding.field));
  return {
    recipe,
    findings,
    score: findings.reduce((sum, finding) => sum + finding.weight, 0),
  };
}

/** The recipes with something that does not fit, the least trustworthy first. */
export function checkLibrary(
  recipes: readonly QualityRecipe[],
  categoryName?: (key: string) => string,
): RecipeCheck[] {
  return recipes
    .map((recipe) => checkRecipe(recipe, categoryName))
    .filter((check) => check.findings.length > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Math.max(...b.findings.map((f) => f.weight)) -
          Math.max(...a.findings.map((f) => f.weight)) ||
        a.recipe.title.localeCompare(b.recipe.title, "de"),
    );
}

/** A suggestion as the household reads it. */
export function suggestionText(
  finding: Finding,
  categoryName: (key: string) => string = (key) => key,
): string | null {
  const value = finding.suggestion;
  if (value === null) return null;
  if (finding.field === "protein") return PROTEIN_NAME[value as ProteinType] ?? value;
  if (finding.field === "category") return categoryName(value);
  if (finding.field === "time") return EFFORT_NAME[value as Effort] ?? value;
  return value;
}

/** What a recipe makes, as one answer to a finding about its servings. */
export interface ServingsChoice {
  min: number;
  max: number;
  unit: string;
}

/** What baking usually makes when nothing in the library says otherwise. */
const USUAL_UNITS = ["Springform (Ø 26 cm)", "Backblech", "Kastenform", "Auflaufform"];
/** A unit that is one tin, tray or dish: a recipe makes one of it. */
const CONTAINER = /form|blech|ring|platte/i;
/** How many choices a finding offers. */
const MOST_CHOICES = 6;

/**
 * The units the library counts in most, most used first: what this household's cookbooks
 * print ("Springform (Ø 26 cm)", "Muffins"). Units used once say little.
 */
export function commonServingsUnits(servings: readonly (Servings | null)[], count = 4): string[] {
  const uses = new Map<string, { unit: string; n: number }>();
  for (const one of servings) {
    const unit = one?.unit?.trim();
    if (!unit) continue;
    const key = unit.toLowerCase();
    uses.set(key, { unit: uses.get(key)?.unit ?? unit, n: (uses.get(key)?.n ?? 0) + 1 });
  }
  return [...uses.values()]
    .filter((use) => use.n > 1)
    .sort((a, b) => b.n - a.n || a.unit.localeCompare(b.unit, "de"))
    .slice(0, count)
    .map((use) => use.unit);
}

/**
 * Answers to a finding about servings, one tap each: one tin or tray of what the library
 * uses most and of what baking usually makes, and where more persons were read than a
 * recipe is for, the number as pieces ("20 Stück", "20 Muffins").
 */
export function servingsChoices(
  servings: Servings | null,
  common: readonly string[],
): ServingsChoice[] {
  const choices: ServingsChoice[] = [];
  const add = (choice: ServingsChoice) => {
    const key = choice.unit.toLowerCase();
    if (!choices.some((other) => other.unit.toLowerCase() === key)) choices.push(choice);
  };
  // Twenty persons were probably twenty pieces; four persons of a cake were not four pieces.
  const pieces = servings !== null && servings.max > MOST_PERSONS ? servings : null;
  for (const unit of [...common, ...USUAL_UNITS]) {
    if (CONTAINER.test(unit)) add({ min: 1, max: 1, unit });
    else if (pieces) add({ min: pieces.min, max: pieces.max, unit });
  }
  if (pieces) add({ min: pieces.min, max: pieces.max, unit: "Stück" });
  return choices.slice(0, MOST_CHOICES);
}

/** "1 Backblech", "20–24 Stück". */
export function servingsChoiceText(choice: ServingsChoice): string {
  const count = choice.min === choice.max ? `${choice.min}` : `${choice.min}–${choice.max}`;
  return `${count} ${choice.unit}`;
}
