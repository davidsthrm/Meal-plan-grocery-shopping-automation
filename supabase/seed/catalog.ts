import type { AisleGroup, BuyingMode, Catalog, Ingredient, Shop } from "@/domain/catalog";
import type { GramsPer, Unit } from "@/domain/units";

/**
 * The household's starting catalog: shops, aisle groups and common German ingredients.
 * Single source for the database seed and for the sample-week script.
 *
 * Shop, shelf life and pack sizes are sensible defaults, taken from the handwritten sample
 * list where it says something and estimated otherwise. All of it is meant to be corrected
 * by the household in the app.
 */

export const shops: Shop[] = [
  { id: "aldi", name: "Aldi", shortLabel: "Aldi", sortOrder: 1, aisleSortOverrides: {} },
  {
    id: "ec",
    name: "E-Center",
    shortLabel: "EC",
    sortOrder: 2,
    // On the sample list, bread comes after the meat counter and before the eggs.
    aisleSortOverrides: { brot: 95 },
  },
  { id: "metzger", name: "Metzger", shortLabel: "Metzger", sortOrder: 3, aisleSortOverrides: {} },
  { id: "baecker", name: "Bäcker", shortLabel: "Bäcker", sortOrder: 4, aisleSortOverrides: {} },
];

export const aisleGroups: AisleGroup[] = [
  // What the market and the butcher sell fresh is marked: it is bought there on a market day.
  { id: "obst", name: "Obst & Gemüse", sortOrder: 10, market: true },
  { id: "konserven", name: "Konserven & Gläser", sortOrder: 20 },
  { id: "backzutaten", name: "Backzutaten", sortOrder: 30 },
  { id: "trockenwaren", name: "Nudeln, Reis & Hülsenfrüchte", sortOrder: 40 },
  { id: "gewuerze", name: "Gewürze, Öl & Essig", sortOrder: 50 },
  { id: "brot", name: "Brot & Backwaren", sortOrder: 60 },
  { id: "molkerei", name: "Molkerei & Kühlregal", sortOrder: 70 },
  { id: "fleisch", name: "Fleisch & Wurst", sortOrder: 80, market: true },
  { id: "fisch", name: "Fisch & Meeresfrüchte", sortOrder: 90, market: true },
  { id: "eier", name: "Eier", sortOrder: 100 },
  { id: "tk", name: "Tiefkühl", sortOrder: 110 },
  { id: "getraenke", name: "Getränke", sortOrder: 120 },
  { id: "suesses", name: "Süßes & Snacks", sortOrder: 130 },
  { id: "haushalt", name: "Haushalt & Drogerie", sortOrder: 140 },
  { id: "sonstiges", name: "Sonstiges", sortOrder: 150 },
];

interface Extra {
  /** Other names, spellings and abbreviations. */
  syn?: string[];
  /** Pack size in the default unit. Makes the ingredient a pack item. */
  pack?: number;
  /** Rounding step in the default unit, for count and weight items. */
  step?: number;
  gramsPer?: GramsPer;
  /** Usually at home. */
  staple?: boolean;
  /** Days it keeps after buying. Leave out for things that keep. */
  shelf?: number;
  shop?: string;
}

/** Builds the rows of one aisle group. `mode` "pack" needs `pack` in the extras. */
function aisle(aisleGroupId: string, defaultShop: string) {
  return (
    id: string,
    name: string,
    defaultUnit: Unit,
    buyingMode: BuyingMode,
    extra: Extra = {},
  ): Ingredient => ({
    id,
    name,
    synonyms: extra.syn ?? [],
    aisleGroupId,
    preferredShopId: extra.shop ?? defaultShop,
    preferredBrand: null,
    defaultUnit,
    buyingMode,
    packSize: extra.pack ?? null,
    roundingStep: extra.step ?? null,
    gramsPer: extra.gramsPer ?? {},
    isPantryStaple: extra.staple ?? false,
    shelfLifeDays: extra.shelf ?? null,
  });
}

const obst = aisle("obst", "aldi");
const konserven = aisle("konserven", "aldi");
const backen = aisle("backzutaten", "aldi");
const trocken = aisle("trockenwaren", "aldi");
const gewuerz = aisle("gewuerze", "aldi");
const brot = aisle("brot", "ec");
const molkerei = aisle("molkerei", "aldi");
const fleisch = aisle("fleisch", "ec");
const fisch = aisle("fisch", "ec");
const eier = aisle("eier", "ec");
const tk = aisle("tk", "aldi");
const getraenk = aisle("getraenke", "aldi");
const suess = aisle("suesses", "aldi");
const haushalt = aisle("haushalt", "aldi");

/** A can or jar bought by the piece: one needs no number, two show as "2x". */
const dose = { pack: 1 };

// prettier-ignore
export const ingredients: Ingredient[] = [
  // Obst & Gemüse
  obst("tomaten", "Tomaten", "Stück", "count", { syn: ["Tomate", "Rispentomaten", "Strauchtomaten"], gramsPer: { Stück: 100 }, shelf: 7 }),
  obst("kleine-tomaten", "kleine Tomaten", "g", "pack", { syn: ["kl. Tomaten", "Kirschtomaten", "Cocktailtomaten", "Cherrytomaten", "Datteltomaten"], pack: 250, gramsPer: { Stück: 15 }, shelf: 7 }),
  obst("karotten", "Karotten", "Stück", "count", { syn: ["Karotte", "Möhren", "Möhre", "Mohrrüben", "gelbe Rüben"], gramsPer: { Stück: 100 }, shelf: 14 }),
  obst("kartoffeln", "Kartoffeln", "g", "pack", { syn: ["Kartoffel", "mehligkochende Kartoffeln", "festkochende Kartoffeln", "Speisekartoffeln"], pack: 2500, gramsPer: { Stück: 100 }, shelf: 21 }),
  obst("suesskartoffeln", "Süßkartoffeln", "Stück", "count", { syn: ["Süßkartoffel"], gramsPer: { Stück: 300 }, shelf: 14 }),
  obst("zwiebeln", "Zwiebeln", "Stück", "none", { syn: ["Zwiebel", "Speisezwiebeln", "Gemüsezwiebel"], gramsPer: { Stück: 80 }, staple: true, shelf: 30 }),
  obst("rote-zwiebeln", "rote Zwiebeln", "Stück", "none", { syn: ["rote Zwiebel"], gramsPer: { Stück: 80 }, shelf: 30 }),
  obst("schalotten", "Schalotten", "Stück", "none", { syn: ["Schalotte"], shelf: 30 }),
  obst("fruehlingszwiebeln", "Frühlingszwiebeln", "Bund", "none", { syn: ["Frühlingszwiebel", "Frühl.zwiebeln", "Lauchzwiebeln", "Lauchzwiebel"], shelf: 7 }),
  obst("knoblauch", "Knoblauch", "Zehe", "none", { syn: ["Knoblauchzehe", "Knoblauchzehen"], gramsPer: { Zehe: 5, Knolle: 50 }, staple: true, shelf: 30 }),
  obst("ingwer", "Ingwer", "g", "none", { syn: ["frischer Ingwer"], shelf: 21 }),
  obst("feldsalat", "Feldsalat", "g", "pack", { syn: ["Rapunzel", "Ackersalat"], pack: 150, shelf: 3 }),
  obst("kopfsalat", "Kopfsalat", "Stück", "count", { syn: ["grüner Salat", "Blattsalat"], shelf: 4 }),
  obst("eisbergsalat", "Eisbergsalat", "Stück", "count", { shelf: 7 }),
  obst("rucola", "Rucola", "g", "pack", { syn: ["Rauke"], pack: 125, shelf: 3 }),
  obst("gurken", "Gurken", "Stück", "count", { syn: ["Gurke", "Salatgurke", "Salatgurken"], shelf: 7 }),
  obst("paprika", "Paprika", "Stück", "count", { syn: ["Paprikaschote", "Paprikaschoten", "rote Paprika", "gelbe Paprika", "grüne Paprika"], gramsPer: { Stück: 150 }, shelf: 7 }),
  obst("zucchini", "Zucchini", "Stück", "count", { gramsPer: { Stück: 200 }, shelf: 7 }),
  obst("auberginen", "Auberginen", "Stück", "count", { syn: ["Aubergine"], shelf: 7 }),
  obst("brokkoli", "Brokkoli", "Stück", "count", { syn: ["Broccoli"], gramsPer: { Stück: 500 }, shelf: 5 }),
  obst("blumenkohl", "Blumenkohl", "Stück", "count", { shelf: 7 }),
  obst("lauch", "Lauch", "Stück", "count", { syn: ["Porree"], gramsPer: { Stück: 200, Stange: 200 }, shelf: 7 }),
  obst("staudensellerie", "Staudensellerie", "Stange", "none", { syn: ["Stangensellerie", "Bleichsellerie"], shelf: 10 }),
  obst("knollensellerie", "Knollensellerie", "Stück", "none", { syn: ["Sellerie", "Sellerieknolle"], shelf: 14 }),
  obst("kohlrabi", "Kohlrabi", "Stück", "count", { shelf: 7 }),
  obst("weisskohl", "Weißkohl", "Stück", "none", { syn: ["Weißkraut", "Spitzkohl"], shelf: 14 }),
  obst("wirsing", "Wirsing", "Stück", "none", { shelf: 7 }),
  obst("blattspinat", "Blattspinat", "g", "pack", { syn: ["Spinat", "frischer Spinat", "Babyspinat"], pack: 250, shelf: 3 }),
  obst("champignons", "Champignons", "g", "pack", { syn: ["braune Champignons", "weiße Champignons", "Egerlinge", "Pilze"], pack: 250, shelf: 4 }),
  obst("kraeuterseitlinge", "Kräuterseitlinge", "g", "pack", { syn: ["Kräuterseitling"], pack: 200, shelf: 4 }),
  obst("kuerbis", "Hokkaido-Kürbis", "Stück", "count", { syn: ["Kürbis", "Hokkaido"], shelf: 30 }),
  obst("gruene-bohnen", "grüne Bohnen", "g", "weight", { syn: ["Buschbohnen", "Bohnen"], step: 50, shelf: 4 }),
  obst("spargel", "Spargel", "g", "weight", { syn: ["weißer Spargel", "grüner Spargel"], step: 250, shelf: 2 }),
  obst("radieschen", "Radieschen", "Bund", "count", { shelf: 5 }),
  obst("avocados", "Avocados", "Stück", "count", { syn: ["Avocado"], shelf: 5 }),
  obst("zitronen", "Zitronen", "Stück", "count", { syn: ["Zitrone", "Bio-Zitrone", "Bio-Zitronen"], shelf: 14 }),
  obst("zitronensaft", "Zitronensaft", "ml", "none"),
  obst("limetten", "Limetten", "Stück", "count", { syn: ["Limette"], shelf: 14 }),
  obst("orangen", "Orangen", "Stück", "count", { syn: ["Orange", "Apfelsinen"], shelf: 14 }),
  obst("aepfel", "Äpfel", "Stück", "count", { syn: ["Apfel"], gramsPer: { Stück: 180 }, shelf: 21 }),
  obst("birnen", "Birnen", "Stück", "count", { syn: ["Birne"], shelf: 7 }),
  obst("bananen", "Bananen", "Stück", "count", { syn: ["Banane"], shelf: 5 }),
  obst("weintrauben", "Weintrauben", "g", "pack", { syn: ["Trauben"], pack: 500, shelf: 5 }),
  obst("erdbeeren", "Erdbeeren", "g", "pack", { pack: 500, shelf: 2 }),
  obst("heidelbeeren", "Heidelbeeren", "g", "pack", { syn: ["Blaubeeren"], pack: 125, shelf: 4 }),
  obst("petersilie", "Petersilie", "Bund", "none", { syn: ["glatte Petersilie", "krause Petersilie", "gehackte Petersilie"], shelf: 5 }),
  obst("schnittlauch", "Schnittlauch", "Bund", "none", { syn: ["Schnittlauchröllchen"], shelf: 5 }),
  obst("basilikum", "Basilikum", "Bund", "none", { syn: ["Basilikumblätter", "frisches Basilikum"], shelf: 7 }),
  obst("koriander", "Koriander", "Bund", "none", { syn: ["Koriandergrün", "frischer Koriander", "frisches Koriandergrün"], shelf: 4 }),
  obst("dill", "Dill", "Bund", "none", { shelf: 4 }),
  obst("thymian", "Thymian", "Bund", "none", { syn: ["Thymianblättchen", "frischer Thymian", "Thymianzweige"], shelf: 7 }),
  obst("rosmarin", "Rosmarin", "Bund", "none", { syn: ["Rosmarinzweige"], shelf: 10 }),
  obst("minze", "Minze", "Bund", "none", { syn: ["frische Minze"], shelf: 5 }),
  obst("chilischoten", "Chilischoten", "Stück", "none", { syn: ["Chilischote", "frische Chili", "rote Chilischote", "Peperoni"], shelf: 10 }),

  // Konserven & Gläser
  konserven("mandarinen-dose", "Mandarinen (Dose)", "Dose", "pack", { ...dose, syn: ["Dosenmandarinen", "Mandarinen aus der Dose"], gramsPer: { Dose: 300 } }),
  konserven("ananas-dose", "Ananas (Dose)", "Dose", "pack", { ...dose, syn: ["Ananasscheiben", "Dosenananas", "Ananas in Scheiben"], gramsPer: { Dose: 340, Scheibe: 35 } }),
  konserven("gehackte-tomaten", "gehackte Tomaten", "Dose", "pack", { ...dose, syn: ["Tomaten gehackt", "stückige Tomaten", "Dosentomaten", "geschälte Tomaten", "Pizzatomaten"], gramsPer: { Dose: 400, ml: 1 } }),
  konserven("passierte-tomaten", "passierte Tomaten", "ml", "pack", { syn: ["Passata", "Tomatenpassata"], pack: 500, gramsPer: { ml: 1.05 } }),
  konserven("tomatenmark", "Tomatenmark", "g", "none", { gramsPer: { ml: 1.1 }, staple: true }),
  konserven("mais", "Mais (Dose)", "Dose", "pack", { ...dose, syn: ["Mais", "Gemüsemais", "Dosenmais"], gramsPer: { Dose: 285 } }),
  konserven("kidneybohnen", "Kidneybohnen", "Dose", "pack", { ...dose, syn: ["rote Bohnen"], gramsPer: { Dose: 400 } }),
  konserven("kichererbsen", "Kichererbsen", "Dose", "pack", { ...dose, syn: ["Kichererbsen (Dose)"], gramsPer: { Dose: 400 } }),
  konserven("weisse-bohnen", "weiße Bohnen", "Dose", "pack", { ...dose, gramsPer: { Dose: 400 } }),
  konserven("kokosmilch", "Kokosmilch", "ml", "pack", { pack: 400, gramsPer: { Dose: 400, ml: 1 } }),
  konserven("oliven", "Oliven", "Glas", "none", { syn: ["schwarze Oliven", "grüne Oliven", "entsteinte Oliven"] }),
  konserven("gewuerzgurken", "Gewürzgurken", "Glas", "none", { syn: ["Essiggurken", "Cornichons", "saure Gurken"] }),
  konserven("thunfisch", "Thunfisch (Dose)", "Dose", "pack", { ...dose, syn: ["Thunfisch", "Dosenthunfisch"], gramsPer: { Dose: 150 } }),
  konserven("pesto", "Pesto", "Glas", "none", { syn: ["grünes Pesto", "Basilikumpesto", "Pesto alla Genovese", "Pesto Genovese"] }),
  konserven("gruener-pfeffer", "grüner Pfeffer (eingelegt)", "Glas", "none", { syn: ["eingelegter grüner Pfeffer", "grüner Pfeffer"] }),
  konserven("kapern", "Kapern", "Glas", "none"),
  konserven("senf", "Senf", "g", "none", { syn: ["mittelscharfer Senf", "Dijonsenf"], staple: true }),
  konserven("ketchup", "Ketchup", "g", "none", { syn: ["Tomatenketchup"], staple: true }),
  konserven("mayonnaise", "Mayonnaise", "g", "none", { syn: ["Mayo"] }),
  konserven("honig", "Honig", "g", "none", { staple: true }),
  konserven("marmelade", "Marmelade", "Glas", "none", { syn: ["Konfitüre"] }),
  konserven("apfelmus", "Apfelmus", "Glas", "none"),
  konserven("sauerkraut", "Sauerkraut", "g", "none"),

  // Backzutaten
  backen("mehl", "Mehl", "g", "none", { syn: ["Weizenmehl", "Mehl Type 405"], gramsPer: { ml: 0.6 }, staple: true }),
  backen("spaetzlemehl", "Spätzlemehl", "g", "none", { syn: ["Spätzle-Mehl"], shop: "ec" }),
  backen("zucker", "Zucker", "g", "none", { gramsPer: { ml: 0.85 }, staple: true }),
  backen("puderzucker", "Puderzucker", "g", "none"),
  backen("vanillezucker", "Vanillezucker", "Packung", "none", { syn: ["Vanillinzucker"] }),
  backen("backpulver", "Backpulver", "Packung", "none", { staple: true }),
  backen("hefe", "Hefe", "Würfel", "none", { syn: ["frische Hefe", "Trockenhefe"], shelf: 10 }),
  backen("speisestaerke", "Speisestärke", "g", "none", { syn: ["Stärke", "Maisstärke"], staple: true }),
  backen("kakao", "Kakao", "g", "none", { syn: ["Backkakao", "Kakaopulver"] }),
  backen("zartbitterschokolade", "Zartbitterschokolade", "g", "pack", { syn: ["Zartbitterkuvertüre", "dunkle Schokolade"], pack: 100 }),
  backen("mandeln", "Mandeln", "g", "none", { syn: ["gemahlene Mandeln", "Mandelblättchen", "Mandelstifte"] }),
  backen("haselnuesse", "Haselnüsse", "g", "none", { syn: ["gemahlene Haselnüsse"] }),
  backen("walnuesse", "Walnüsse", "g", "none", { syn: ["Walnusskerne"] }),
  backen("pinienkerne", "Pinienkerne", "g", "none"),
  backen("rosinen", "Rosinen", "g", "none"),
  backen("semmelbroesel", "Semmelbrösel", "g", "none", { syn: ["Paniermehl"] }),

  // Nudeln, Reis & Hülsenfrüchte
  trocken("spaghetti", "Spaghetti", "g", "pack", { pack: 500 }),
  trocken("nudeln", "Nudeln", "g", "pack", { syn: ["Pasta", "Penne", "Fusilli", "Farfalle", "Tagliatelle", "Bandnudeln", "Spirelli"], pack: 500 }),
  trocken("lasagneplatten", "Lasagneplatten", "Packung", "none"),
  trocken("reis", "Reis", "g", "none", { syn: ["Basmatireis", "Langkornreis"], staple: true }),
  trocken("risottoreis", "Risottoreis", "g", "none", { syn: ["Arborio"] }),
  trocken("couscous", "Couscous", "g", "none"),
  trocken("bulgur", "Bulgur", "g", "none"),
  trocken("braune-linsen", "braune Linsen", "g", "none", { syn: ["Tellerlinsen", "Linsen"] }),
  trocken("rote-linsen", "rote Linsen", "g", "none"),
  trocken("kurzkoch-linsen", "Kurzkoch-Linsen", "Beutel", "none", { syn: ["Tempo-Linsen", "Linsen im Kochbeutel"] }),
  trocken("haferflocken", "Haferflocken", "g", "none"),
  trocken("muesli", "Müsli", "g", "none"),

  // Gewürze, Öl & Essig: all usually at home
  gewuerz("salz", "Salz", "g", "none", { syn: ["Meersalz"], staple: true }),
  gewuerz("pfeffer", "Pfeffer", "g", "none", { syn: ["schwarzer Pfeffer", "weißer Pfeffer"], staple: true }),
  gewuerz("paprikapulver", "Paprikapulver", "g", "none", { syn: ["Paprika edelsüß", "Paprikapulver edelsüß", "Paprika rosenscharf"], staple: true }),
  gewuerz("currypulver", "Currypulver", "g", "none", { syn: ["Curry"], staple: true }),
  gewuerz("kreuzkuemmel", "Kreuzkümmel", "g", "none", { syn: ["Cumin"], staple: true }),
  gewuerz("zimt", "Zimt", "g", "none", { staple: true }),
  gewuerz("muskatnuss", "Muskatnuss", "g", "none", { syn: ["Muskat"], staple: true }),
  gewuerz("oregano", "Oregano", "g", "none", { syn: ["getrockneter Oregano"], staple: true }),
  gewuerz("italienische-kraeuter", "italienische Kräuter", "g", "none", { syn: ["ital. Kräuter"], staple: true }),
  gewuerz("chiliflocken", "Chiliflocken", "g", "none", { syn: ["Chilipulver"], staple: true }),
  gewuerz("getrocknete-chilischoten", "getrocknete Chilischoten", "Stück", "none", { syn: ["getrocknete Chilischote"], staple: true }),
  gewuerz("lorbeerblaetter", "Lorbeerblätter", "Blatt", "none", { syn: ["Lorbeerblatt", "Lorbeer"], staple: true }),
  gewuerz("olivenoel", "Olivenöl", "ml", "none", { staple: true }),
  gewuerz("rapsoel", "Rapsöl", "ml", "none", { staple: true }),
  gewuerz("oel", "Öl", "ml", "none", { syn: ["Speiseöl", "Pflanzenöl", "Sonnenblumenöl", "neutrales Öl"], staple: true }),
  gewuerz("weissweinessig", "Weißweinessig", "ml", "none", { syn: ["Essig", "Weinessig", "Kräuteressig"], staple: true }),
  gewuerz("balsamico", "Balsamico", "ml", "none", { syn: ["Aceto balsamico", "Balsamicoessig", "Balsamessig"], staple: true }),
  gewuerz("sojasauce", "Sojasauce", "ml", "none", { syn: ["Sojasoße"], staple: true }),
  gewuerz("gemuesebruehe", "Gemüsebrühe", "ml", "none", { syn: ["Brühe", "Gemüsefond", "Gemüsebrühpulver"], staple: true }),
  gewuerz("huehnerbruehe", "Hühnerbrühe", "ml", "none", { syn: ["Geflügelbrühe", "Hühnerfond", "Geflügelfond"], staple: true }),
  gewuerz("rinderbruehe", "Rinderbrühe", "ml", "none", { syn: ["Fleischbrühe", "Rinderfond"], staple: true }),

  // Brot & Backwaren
  brot("brot", "Brot", "Stück", "none", { syn: ["Bauernbrot", "Mischbrot", "Vollkornbrot"], shelf: 3 }),
  brot("toast", "Toast", "Scheibe", "none", { syn: ["Toastbrot", "Buttertoast", "Sandwichtoast", "Toastscheiben"], gramsPer: { Scheibe: 25 }, shelf: 10, shop: "aldi" }),
  brot("broetchen", "Brötchen", "Stück", "count", { syn: ["Semmeln", "Wecken"], shelf: 1 }),
  brot("baguette", "Baguette", "Stück", "count", { shelf: 1 }),
  brot("brezeln", "Brezeln", "Stück", "count", { syn: ["Laugenbrezeln", "Brezel"], shelf: 1 }),
  brot("wraps", "Tortilla-Wraps", "Packung", "none", { syn: ["Wraps", "Tortillas", "Weizentortillas"], shop: "aldi" }),

  // Molkerei & Kühlregal
  molkerei("milch", "Milch", "ml", "pack", { syn: ["Vollmilch", "frische Milch", "H-Milch"], pack: 1000, gramsPer: { ml: 1.03 }, shelf: 5, shop: "ec" }),
  molkerei("butter", "Butter", "g", "pack", { pack: 250, shelf: 30, shop: "ec" }),
  molkerei("sahne", "Sahne", "ml", "pack", { syn: ["Schlagsahne", "süße Sahne", "Sahne frisch", "frische Sahne"], pack: 200, gramsPer: { Becher: 200, ml: 1 }, shelf: 14 }),
  molkerei("h-sahne", "H-Sahne", "ml", "pack", { syn: ["haltbare Sahne"], pack: 200, gramsPer: { ml: 1 } }),
  molkerei("creme-fraiche", "Crème fraîche", "g", "pack", { pack: 200, gramsPer: { Becher: 200, ml: 1 }, shelf: 14 }),
  molkerei("schmand", "Schmand", "g", "pack", { pack: 200, gramsPer: { Becher: 200, ml: 1 }, shelf: 14 }),
  molkerei("saure-sahne", "saure Sahne", "g", "pack", { syn: ["Sauerrahm"], pack: 200, gramsPer: { Becher: 200, ml: 1 }, shelf: 14 }),
  molkerei("quark", "Quark", "g", "pack", { syn: ["Speisequark", "Magerquark"], pack: 500, shelf: 10 }),
  molkerei("naturjoghurt", "Naturjoghurt", "g", "pack", { syn: ["Joghurt", "griechischer Joghurt"], pack: 500, gramsPer: { ml: 1 }, shelf: 10 }),
  molkerei("frischkaese", "Frischkäse", "g", "pack", { syn: ["Doppelrahmfrischkäse"], pack: 200, shelf: 14 }),
  molkerei("mascarpone", "Mascarpone", "g", "pack", { pack: 250, shelf: 14 }),
  molkerei("mozzarella", "Mozzarella", "g", "pack", { syn: ["Büffelmozzarella"], pack: 125, shelf: 10 }),
  molkerei("mini-mozzarella", "Mini-Mozzarella", "g", "pack", { syn: ["Mozzarella-Kugeln", "Mozzarellini"], pack: 125, shelf: 10 }),
  molkerei("gouda-scheiben", "Gouda (Scheiben)", "Scheibe", "none", { syn: ["Gouda in Scheiben", "Scheibenkäse", "Käsescheiben"], shelf: 14 }),
  molkerei("gouda", "Gouda", "g", "none", { syn: ["Gouda am Stück"], shelf: 21 }),
  molkerei("emmentaler", "Emmentaler", "g", "none", { shelf: 21 }),
  molkerei("bergkaese", "Bergkäse", "g", "none", { shelf: 21 }),
  molkerei("parmesan", "Parmesan", "g", "none", { syn: ["Parmigiano", "geriebener Parmesan"], shelf: 30 }),
  molkerei("reibekaese", "geriebener Käse", "g", "pack", { syn: ["Reibekäse", "Streukäse", "geriebener Emmentaler", "geriebener Gouda"], pack: 200, shelf: 14 }),
  molkerei("kaese", "Käse", "g", "none", { syn: ["Schnittkäse"], shelf: 14 }),
  molkerei("schafskaese", "Schafskäse", "g", "pack", { syn: ["Feta", "Hirtenkäse"], pack: 200, shelf: 14 }),
  molkerei("ofenkaese", "Ofenkäse", "Stück", "count", { syn: ["Backcamembert"], shelf: 14 }),
  molkerei("camembert", "Camembert", "Stück", "count", { shelf: 10 }),
  molkerei("spaetzle", "Spätzle (frisch)", "g", "pack", { syn: ["frische Spätzle", "Spätzle", "Eierspätzle"], pack: 500, shelf: 10 }),
  molkerei("maultaschen", "Maultaschen", "Packung", "none", { shelf: 10 }),
  molkerei("gnocchi", "Gnocchi", "g", "pack", { pack: 500, shelf: 14 }),
  molkerei("tortellini", "Tortellini", "g", "pack", { pack: 250, shelf: 10 }),
  molkerei("blaetterteig", "Blätterteig", "Packung", "none", { shelf: 10 }),
  molkerei("pizzateig", "Pizzateig", "Packung", "none", { shelf: 7 }),

  // Eier: bought in boxes of ten
  eier("eier", "Eier", "Stück", "count", { syn: ["Ei"], step: 10, gramsPer: { Stück: 60 }, shelf: 21 }),

  // Fleisch & Wurst
  fleisch("rindersteaks", "Rindersteaks", "Stück", "count", { syn: ["Rindersteak", "Steak", "Steaks", "Rumpsteak", "Hüftsteak"], shelf: 2 }),
  fleisch("hackfleisch", "Hackfleisch", "g", "weight", { syn: ["gemischtes Hackfleisch", "Hackfleisch gemischt", "Gehacktes"], step: 50, shelf: 1 }),
  fleisch("rinderhackfleisch", "Rinderhackfleisch", "g", "weight", { syn: ["Rinderhack", "Tatar"], step: 50, shelf: 1 }),
  fleisch("haehnchenbrust", "Hähnchenbrust", "g", "weight", { syn: ["Hähnchenbrustfilet", "Hähnchenbrustfilets", "Hühnerbrust", "Hähnchenfilet"], step: 50, gramsPer: { Stück: 180 }, shelf: 2 }),
  fleisch("haehnchenschenkel", "Hähnchenschenkel", "Stück", "count", { shelf: 2 }),
  fleisch("putenschnitzel", "Putenschnitzel", "Stück", "count", { syn: ["Putenbrust"], shelf: 2 }),
  fleisch("schweineschnitzel", "Schweineschnitzel", "Stück", "count", { syn: ["Schnitzel"], shelf: 2 }),
  fleisch("schweinefilet", "Schweinefilet", "g", "weight", { step: 50, shelf: 2 }),
  fleisch("rindergulasch", "Rindergulasch", "g", "weight", { syn: ["Gulasch", "Gulaschfleisch"], step: 100, shelf: 2 }),
  fleisch("bratwuerste", "Bratwürste", "Stück", "count", { syn: ["Bratwurst"], shelf: 3 }),
  fleisch("wiener", "Wiener Würstchen", "Stück", "count", { syn: ["Wiener", "Saitenwürstle", "Würstchen"], shelf: 7 }),
  fleisch("speck", "Speck", "g", "none", { syn: ["durchwachsener Speck", "Bauchspeck", "Räucherspeck", "Speckwürfel"], shelf: 14 }),
  fleisch("kochschinken", "Kochschinken", "Scheibe", "none", { syn: ["gekochter Schinken", "Schinken"], shelf: 5 }),
  fleisch("salami", "Salami", "g", "none", { shelf: 14 }),
  fleisch("rauchsalami", "Rauchsalami", "g", "none", { shelf: 14 }),
  fleisch("mini-salami", "Mini-Salami", "g", "none", { syn: ["Salami-Sticks"], shelf: 21 }),
  fleisch("leberkaese", "Leberkäse", "g", "weight", { syn: ["Fleischkäse"], step: 50, shelf: 5 }),
  fleisch("lyoner", "Lyoner", "g", "none", { syn: ["Fleischwurst"], shelf: 5 }),
  fleisch("frischwurst", "Frischwurst", "g", "none", { syn: ["Aufschnitt", "Wurstaufschnitt"], shelf: 4, shop: "metzger" }),
  fleisch("fleischsalat", "Fleischsalat", "g", "none", { shelf: 4, shop: "metzger" }),

  // Fisch & Meeresfrüchte
  fisch("garnelen", "Garnelen", "g", "pack", { syn: ["Shrimps", "Riesengarnelen", "Garnelenschwänze"], pack: 225, shelf: 5, shop: "aldi" }),
  fisch("lachsfilet", "Lachsfilet", "g", "weight", { syn: ["Lachs", "frischer Lachs"], step: 50, gramsPer: { Stück: 150 }, shelf: 1 }),
  fisch("raeucherlachs", "Räucherlachs", "g", "pack", { pack: 200, shelf: 10, shop: "aldi" }),

  // Tiefkühl
  tk("tk-erbsen", "Erbsen (TK)", "g", "none", { syn: ["Erbsen", "TK-Erbsen"] }),
  tk("tk-spinat", "Spinat (TK)", "g", "none", { syn: ["TK-Spinat", "Rahmspinat"] }),
  tk("tk-kraeuter", "TK-Kräuter", "Packung", "none", { syn: ["ital. TK-Kräuter", "italienische TK-Kräuter", "TK-Kräutermischung"] }),
  tk("tk-pizza", "Tiefkühlpizza", "Stück", "count", { syn: ["TK-Pizza"] }),
  tk("pommes", "Pommes frites", "Packung", "none", { syn: ["Pommes"] }),
  tk("fischstaebchen", "Fischstäbchen", "Packung", "none"),
  tk("eis", "Eis", "Packung", "none", { syn: ["Vanilleeis"] }),
  tk("tk-beeren", "Beeren (TK)", "g", "none", { syn: ["TK-Beeren", "Beerenmischung"] }),

  // Getränke
  getraenk("mineralwasser", "Mineralwasser", "ml", "none", { syn: ["Wasser", "Sprudel"] }),
  getraenk("apfelsaft", "Apfelsaft", "ml", "none"),
  getraenk("orangensaft", "Orangensaft", "ml", "none"),
  getraenk("kaffee", "Kaffee", "g", "none"),
  getraenk("tee", "Tee", "Packung", "none"),
  getraenk("weisswein", "Weißwein", "ml", "none", { syn: ["trockener Weißwein"] }),
  getraenk("rotwein", "Rotwein", "ml", "none"),
  getraenk("bier", "Bier", "ml", "none"),

  // Süßes & Snacks
  suess("schokolade", "Schokolade", "g", "none", { syn: ["Vollmilchschokolade"] }),
  suess("kekse", "Kekse", "Packung", "none"),
  suess("chips", "Chips", "Packung", "none"),

  // Haushalt & Drogerie
  haushalt("toilettenpapier", "Toilettenpapier", "Packung", "none", { syn: ["Klopapier"] }),
  haushalt("kuechenrolle", "Küchenrolle", "Packung", "none", { syn: ["Küchenpapier"] }),
  haushalt("spuelmittel", "Spülmittel", "Packung", "none"),
  haushalt("spuelmaschinentabs", "Spülmaschinentabs", "Packung", "none"),
  haushalt("waschmittel", "Waschmittel", "Packung", "none"),
  haushalt("muellbeutel", "Müllbeutel", "Packung", "none"),
  haushalt("backpapier", "Backpapier", "Packung", "none"),
  haushalt("alufolie", "Alufolie", "Packung", "none"),
  haushalt("frischhaltefolie", "Frischhaltefolie", "Packung", "none"),
  haushalt("taschentuecher", "Taschentücher", "Packung", "none"),
];

export const seedCatalog: Catalog = {
  shops,
  aisleGroups,
  ingredients,
  defaultShopId: "aldi",
  fallbackAisleGroupId: "sonstiges",
};
