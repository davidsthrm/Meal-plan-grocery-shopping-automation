import { searchKey, type RecipeFilter } from "./filter";
import type { RecipeSummary } from "./summary";

/**
 * The little picture a recipe is shown with, so that cards can be told apart at a glance: a
 * bowl of pasta, a fish, a cake. Chosen from what is known about the recipe; never a photo.
 * The second half of the list is for the ways the library is narrowed down: how much work,
 * which cuisine, which season.
 */
export const PICTOGRAMS = [
  "pasta",
  "suppe",
  "salat",
  "fisch",
  "gefluegel",
  "fleisch",
  "gemuese",
  "reis",
  "kartoffel",
  "auflauf",
  "pizza",
  "burger",
  "brot",
  "ei",
  "kuchen",
  "dessert",
  "fruehstueck",
  "getraenk",
  "dip",
  "snack",
  "teller",
  "beilage",
  "blitz",
  "topf",
  "sanduhr",
  "pfanne",
  "ofen",
  "brezel",
  "tomate",
  "olive",
  "box",
  "tajine",
  "taco",
  "tulpe",
  "sonne",
  "pilz",
  "schneeflocke",
  "glas",
  "glocke",
  "grill",
  "korb",
  "tanne",
  "spross",
  "buch",
  "etikett",
] as const;
export type Pictogram = (typeof PICTOGRAMS)[number];

/** Categories that say what the dish looks like. */
const BY_CATEGORY: Record<string, Pictogram> = {
  "suppe-eintopf": "suppe",
  salat: "salat",
  vesper: "brot",
  snack: "snack",
  dessert: "dessert",
  kuchen: "kuchen",
  fruehstueck: "fruehstueck",
  getraenk: "getraenk",
  grundrezept: "dip",
};

/** Tags of the group "Gericht" that say it. */
const BY_TAG: [string, Pictogram][] = [
  ["pasta", "pasta"],
  ["pizza", "pizza"],
  ["burger", "burger"],
  ["reis", "reis"],
  ["kartoffeln", "kartoffel"],
  ["auflauf", "auflauf"],
];

/** Words in a title that say it, as the search compares words. The first that fits wins. */
const BY_WORD: [RegExp, Pictogram][] = [
  [/suppe|eintopf|bruhe|minestrone|chili|gulasch|ramen/, "suppe"],
  [/pizza|flammkuchen|quiche|tarte|focaccia/, "pizza"],
  [/burger|wrap|sandwich|toast|tortilla|taco|doner|baguette/, "burger"],
  [
    /nudel|spaghetti|pasta|penne|tagliatelle|lasagne|gnocchi|spatzle|ravioli|tortellini|makkaroni|maultasche|cannelloni|farfalle|linguine|rigatoni|fusilli/,
    "pasta",
  ],
  [/risotto|reis|paella|couscous|bulgur|quinoa|pilaw/, "reis"],
  [/auflauf|gratin|uberbacken/, "auflauf"],
  [/kartoffel|pommes|rosti|puffer|knodel|kroketten/, "kartoffel"],
  [/omelett|ruhrei|frittata|pfannkuchen|spiegelei|crepe/, "ei"],
  [/salat/, "salat"],
];

const BY_PROTEIN: Partial<Record<NonNullable<RecipeSummary["proteinType"]>, Pictogram>> = {
  fish: "fisch",
  poultry: "gefluegel",
  red_meat: "fleisch",
  vegetarian: "gemuese",
  vegan: "gemuese",
};

/**
 * The pictogram of a recipe. What kind of dish it is counts before what is in it: a salmon
 * pasta is shown as pasta, a roast as meat.
 */
export function pictogramFor(
  recipe: Pick<RecipeSummary, "title" | "category" | "proteinType" | "tags">,
): Pictogram {
  const byCategory = recipe.category ? BY_CATEGORY[recipe.category] : undefined;
  if (byCategory) return byCategory;
  const byTag = BY_TAG.find(([tag]) => recipe.tags.includes(tag));
  if (byTag) return byTag[1];
  const title = searchKey(recipe.title);
  const byWord = BY_WORD.find(([words]) => words.test(title));
  if (byWord) return byWord[1];
  return (recipe.proteinType && BY_PROTEIN[recipe.proteinType]) || "teller";
}

/** Every category has a picture where the library is browsed by it. */
const CATEGORY_PICTURE: Record<string, Pictogram> = {
  ...BY_CATEGORY,
  hauptgericht: "teller",
  beilage: "beilage",
};

/** The tags the app knows by key, each with its picture. */
const TAG_PICTURE: Record<string, Pictogram> = {
  schnell: "blitz",
  alltag: "topf",
  aufwendig: "sanduhr",
  pasta: "pasta",
  reis: "reis",
  kartoffeln: "kartoffel",
  auflauf: "auflauf",
  pizza: "pizza",
  pfanne: "pfanne",
  ofen: "ofen",
  burger: "burger",
  deutsch: "brezel",
  italienisch: "tomate",
  mediterran: "olive",
  asiatisch: "box",
  orientalisch: "tajine",
  amerikanisch: "taco",
  fruehling: "tulpe",
  sommer: "sonne",
  herbst: "pilz",
  winter: "schneeflocke",
  "fuer-gaeste": "glas",
  fest: "glocke",
  grillen: "grill",
  mitnehmen: "korb",
  weihnachten: "tanne",
};

const DIET_PICTURE: Record<NonNullable<RecipeFilter["diet"]>, Pictogram> = {
  vegetarisch: "gemuese",
  vegan: "spross",
  fisch: "fisch",
  gefluegel: "gefluegel",
  fleisch: "fleisch",
};

/**
 * The picture of one way to narrow the library down: a category, a tag, a diet or a
 * cookbook. A tag the household made itself is shown as a label.
 */
export function pictogramForFilter(
  filter: Pick<RecipeFilter, "category" | "tags" | "diet" | "book">,
): Pictogram {
  if (filter.category) return CATEGORY_PICTURE[filter.category] ?? "teller";
  if (filter.tags.length > 0) return TAG_PICTURE[filter.tags[0]] ?? "etikett";
  if (filter.diet) return DIET_PICTURE[filter.diet];
  return filter.book ? "buch" : "teller";
}
