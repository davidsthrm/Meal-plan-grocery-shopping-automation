import { searchKey } from "./filter";

/**
 * The tags of the group "Hauptzutat": what a dish is made of, read from its ingredients and
 * its title, without a model. "Was mache ich mit dem Hackfleisch?" is then one tap.
 *
 * Only what is the heart of a dish counts. Mince, chicken, salmon or lentils are, wherever
 * they are in it; a broth, a little bacon or an egg in a dough is not. Eggs and cheese are
 * in too many recipes for the ingredient to say it, so only a title that is about them
 * does ("Rührei", "Käsespätzle").
 */

export const MAIN_INGREDIENTS = [
  "hackfleisch",
  "haehnchen",
  "rind",
  "schwein",
  "lachs",
  "garnelen",
  "huelsenfruechte",
  "tofu",
  "pilze",
  "eier",
  "kaese",
] as const;
export type MainIngredient = (typeof MAIN_INGREDIENTS)[number];

/** As the tags are named for a new household (`supabase/seed/recipes.ts`, the migration). */
export const MAIN_INGREDIENT_NAME: Record<MainIngredient, string> = {
  hackfleisch: "Hackfleisch",
  haehnchen: "Hähnchen & Pute",
  rind: "Rind & Kalb",
  schwein: "Schwein",
  lachs: "Lachs & Forelle",
  garnelen: "Garnelen & Meeresfrüchte",
  huelsenfruechte: "Hülsenfrüchte",
  tofu: "Tofu & Tempeh",
  pilze: "Pilze",
  eier: "Eier",
  kaese: "Käse",
};

/** Words of a name that make it something else than the meat or fish: a broth, a fat. */
const NOT_THE_THING = /(bruhe|fond|bouillon|brat?fett|schmalz|talg|aroma|gewurz|wurfel|sosse)$/;

/**
 * Per ingredient word, what it is the heart of, and what looks alike and is not. The first
 * that fits wins, so that "Putenhack" is mince and "Lachssteak" is no beef. Words are
 * compared as the search compares them: "Hähnchen" is "hahnchen".
 */
const BY_WORD: { tag: MainIngredient; is: RegExp; not?: RegExp }[] = [
  {
    tag: "garnelen",
    is: /garnele|shrimp|scampi|krabbe|gamba|muschel|tintenfisch|calamar|oktopus|meeresfrucht/,
  },
  { tag: "lachs", is: /lachs|forelle|saibling/, not: /seelachs|lachsschinken/ },
  {
    tag: "hackfleisch",
    is: /^(hack|gehacktes|mett)$|hackfleisch$|(rinder|rind|schweine|lamm|puten|geflugel|kalbs)hack$/,
  },
  {
    tag: "haehnchen",
    is: /hahnchen|huhn|poularde|pute|truthahn|chicken|geflugel/,
    not: /(ei|eier)$/,
  },
  {
    tag: "rind",
    is: /rind|kalb|beef|tafelspitz|roulade|gulasch|entrecote|huftsteak|rumpsteak|ochsen|^steaks?$/,
    // A tomato of that name, and a goulash of mushrooms or lentils.
    not: /rinde$|ochsenherz|(pilz|gemuse|linsen|kurbis|tofu|seitan|bohnen|kartoffel)(gulasch|roulade)/,
  },
  {
    tag: "schwein",
    is: /schwein|kotelett|nacken|kassler|kasseler|spanferkel|pulledpork|schnitzel|leberkas|krustenbraten|schaufele|haxe/,
    not: /sellerie|kohlrabi|zucchini|auberginen/,
  },
  {
    tag: "huelsenfruechte",
    is: /linse|kichererbse|kidneybohne|weissebohne|schwarzebohne|rotebohne|cannellini|borlotti|butterbohne|limabohne|mungbohne|edamame|sojabohne|lupine|hummus|falafel/,
  },
  { tag: "tofu", is: /tofu|tempeh|seitan/ },
  {
    tag: "pilze",
    is: /champignon|egerling|pilz|seitling|pfifferling|shiitake|morchel|portobello/,
  },
];

/** Words of a title that make the egg the heart of a dish. */
const EGG_TITLE =
  /^(ei|eier|omelett|omelette|frittata|ruhrei|spiegelei|shakshuka|eiersalat|tortilla)$/;
/** Words of a title that make cheese the heart of a dish. */
const CHEESE_TITLE =
  /(kase|halloumi|feta|camembert|raclette|mozzarella|burrata|ricotta|gorgonzola|fondue|kasespatzle)/;
/** Sweet things are about their cake, not about the quark or the egg in it. */
const SWEET = new Set(["kuchen", "plaetzchen", "dessert", "getraenk"]);

const words = (text: string) =>
  text
    .split(/[^\p{L}\p{N}]+/u)
    .map(searchKey)
    .filter(Boolean);

/**
 * A name as one key per word and as one key for the whole: "weiße Bohnen" is "weissebohnen"
 * as well as its two words. Both are matched.
 */
const keysOf = (name: string) => [...words(name), searchKey(name)];

export interface RecipeToRead {
  title: string;
  category: string | null;
  /** Each ingredient line: its catalog name, or the printed line the catalog does not know. */
  ingredients: readonly string[];
}

/** The main ingredients of a recipe, in the order of `MAIN_INGREDIENTS`. */
export function mainIngredients(recipe: RecipeToRead): MainIngredient[] {
  const found = new Set<MainIngredient>();
  const sweet = recipe.category !== null && SWEET.has(recipe.category);
  const read = (key: string) => {
    if (NOT_THE_THING.test(key)) return;
    const hit = BY_WORD.find((entry) => entry.is.test(key) && !entry.not?.test(key));
    if (hit) found.add(hit.tag);
  };
  if (!sweet) {
    for (const line of recipe.ingredients) for (const key of keysOf(line)) read(key);
  }
  const title = words(recipe.title);
  if (!sweet) for (const word of title) read(word);
  if (!sweet && title.some((word) => EGG_TITLE.test(word))) found.add("eier");
  if (!sweet && title.some((word) => CHEESE_TITLE.test(word))) found.add("kaese");
  return MAIN_INGREDIENTS.filter((key) => found.has(key));
}
