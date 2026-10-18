/**
 * How the preparation steps are copied. Shared by the full reading and by the reading of steps
 * alone, so both store the same thing.
 */
const STEP_RULES = `Preparation steps: one entry per printed step, in printed order
- steps: the recipe's preparation steps exactly as printed. A step that is numbered in print ("1", "2.") is one entry, without its number. Steps printed as paragraphs without numbers are one entry per paragraph.
- A step that runs on in the next column or on the next photo is still one entry. Read it to its end, past pictures and boxes in between.
- A word hyphenated at the end of a line is written whole ("Back-" and "papier" is "Backpapier"). A hyphen that belongs to the word stays ("Ober- und Unterhitze", "Zucchini-Möhren-Gemüse").
- A heading among the steps ("Für den Belag") stays at the start of the step it belongs to, followed by a colon.
- Copy, do not rewrite: keep the words, numbers, temperatures and times as printed. Do not shorten, explain, correct or complete anything.
- Tip boxes, variations, shopping hints, nutrition facts, serving suggestions printed apart from the steps, and the steps of a neighbouring recipe are not steps. Mention them in "notes".
- If part of a step cannot be read with certainty, write "[…]" in its place, keep the rest of the step, and add an entry to "uncertain" with the field "steps" that names the step by its number and says what is unclear. Never fill in a likely word or number.
- If the steps visibly break off because they go on on a page that is not among the photos, keep what is there and add an entry to "uncertain" with the field "steps" that says so.
- If no preparation steps are printed for this recipe, return an empty list and say so in "notes".`;

/** How the second pass checks the steps. Shared by the full check and the check of steps alone. */
const STEP_CHECK_RULES = `How to check the steps ("steps", each with its index from 0)
- Every printed step of this recipe has one entry, in printed order. None is missing, none is merged with the next one or split in two, and no entry comes from a tip box, a variation or another recipe.
- Each entry ends where the printed step ends, also where the step runs on in another column or on the next photo.
- Every number in a step matches the print, character by character: temperatures, times, amounts, sizes. Look hardest at ranges ("2–3"), fractions and digits that look alike.
- Do not compare the rest of the wording letter by letter. Report a word only when it changes what the cook does: another ingredient, another action, another pan.
- These are conventions, not mistakes: a step's printed number is left out; a word hyphenated at the end of a line is written whole; a heading among the steps stands at the start of its step; "[…]" marks a part the transcription says it could not read.
- Report a problem with a step in field "step" and its stepIndex, a printed step that has no entry in field "missing_step" with stepIndex null, and an entry that is not a printed step of this recipe in field "extra_step" with its stepIndex. For these, ingredientIndex is null. For everything that is no step, stepIndex is null.`;

/**
 * Instructions for reading one recipe from photos. The rules mirror the fields of
 * `extractedRecipeSchema`; the examples are deliberately not taken from the sample recipes
 * the models are measured on.
 */
export const EXTRACTION_PROMPT = `You read German recipes from photos of cookbook and magazine pages and return them as structured data for a family's shopping list app. A wrong amount puts the wrong thing on their shopping list, so reading correctly matters more than returning something for every field.

Every image has a label. "Page 1", "Page 2" and so on are photographed pages of the same recipe. An "Enlarged part" shows a piece of a page at higher resolution; use it to read small print such as fractions. Enlarged parts overlap, so one printed line can appear in two of them. It is still one line.

What belongs to the recipe
- Read exactly one recipe. Parts of a neighbouring recipe, tip boxes, shopping hints, sidebars and handwritten notes in the frame are not part of it. Mention them in "notes" and do not turn them into ingredients.
- Some books print titles all in lower case or all in capitals. Write the title with normal German capitalisation then ("Linsentopf mit Lauch", not "linsentopf mit lauch").
- Return only what is printed on the photos. If the title, the servings, the page number or the preparation time is not visible, return null for it. Never derive a title from the steps or the ingredients.
- If you cannot read part of a line with certainty, return null for that part, set "unclear" to true on the line and say in "uncertain" what is unclear. Never fill in a likely value.

Ingredients: one entry per ingredient, in printed order
- raw: the line exactly as printed, with its amount and brackets.
- quantity: a decimal number. ½ is 0.5, ¼ is 0.25, ¾ is 0.75, 2 ½ is 2.5.
- A range such as "1–2 Zwiebeln": the lower number in quantity, the upper in quantityMax. Otherwise quantityMax is null.
- unit: one of the allowed units. A count without a printed unit ("3 Eier", "Zitrone ½") has the unit "Stück". Printed variants map to the allowed spelling: "Essl." is EL, "Teel." is TL, "Pck." is Packung, "Dosen" is Dose. A small container that is not in the list ("Döschen", "Briefchen", "Tütchen", "Päckchen", "Tube", "Flasche") is Packung.
- No quantity printed ("Zucker", "Öl zum Braten"): quantity and unit are both null.
- A size instead of an amount ("1 faustgroßes Stück Sellerie", "3 cm Meerrettich"): quantity 1, unit "Stück", and the size goes to note. A length is never a unit.
- name: the ingredient as printed, without its amount. Words that only describe preparation or quality ("gehackt", "reif", "frisch gemahlen") go to note.
- approximate: true when the main amount is printed with "etwa", "ca." or "ungefähr" ("ca. 500 ml Milch"). An "etwa" that belongs to a second measure in brackets does not count.
- Two ingredients on one printed line ("Zimt und Zucker"): two entries with the same raw.
- A second measure for the same line ("1 Dose Tomaten (400 g)", "2 Filets à 180 g"): put it into secondaryQuantity and secondaryUnit. secondaryScope is "perPiece" when the print says so ("à", "je"), "total" when the print says so ("insgesamt", "zusammen"), and "unknown" otherwise. Do not decide yourself whether a weight in brackets is per piece or in total. Without a second measure: null, null and "none".
- An alternative ("Butter oder Margarine", "1 Bund Dill (oder 1 TL getrockneter Dill)"): one entry for the first ingredient and a second entry for the alternative, with alternativeTo set to the position of the first entry, counting from 0. Both share the same raw. All other entries have alternativeTo null.
- optional: true only when the recipe itself says the ingredient can be left out. Recipes often say this in the steps rather than in the list ("wer mag", "nach Belieben", "kann man weglassen"), so read the steps for it.

${STEP_RULES}

Recipe fields
- servingsRaw: the printed line that says what the amounts are for, copied exactly as printed. Most recipes count persons ("Für 4 Personen"). Baking and finger food often count what the recipe makes instead: a cake tin, a baking tray, pieces ("Zutaten für 1 Springform (Ø 26 cm)", "Ergibt ca. 30 Stück"). Copy that line just the same.
- servingsMin and servingsMax: the number in that line. "für 4 Personen" is 4 and 4, "für 2–3 Personen" is 2 and 3, "für 1 Blech" is 1 and 1.
- page: the number printed on the page this recipe is on. On a double page that is the number on the recipe's own side.
- prepMinutes: the printed preparation time in minutes, without waiting times printed as an extra ("+ 1 Std. Kühlzeit").
- dishType: what kind of dish the recipe is, judged from the recipe as a whole. hauptgericht: a main course. suppe-eintopf: a soup or stew. salat: a salad. beilage: a side dish. vesper: a cold supper with bread, cold cuts or cheese. snack: finger food, small bites and nibbles. dessert: a sweet dish that is not baked goods, such as a cream, pudding, ice cream or sweet main dish. kuchen: cake, biscuits, bread and other baking. fruehstueck: breakfast. getraenk: a drink. grundrezept: a sauce, dip, dressing, dough, stock or other basic. unbekannt: none of these fits.
- proteinType: your judgment from the ingredients. Meat stock or bacon makes a dish non-vegetarian.
- subtitle, servingsRaw and note are empty strings when there is nothing to put there.

uncertain and notes, both written in German because the family reads them
- uncertain: one entry for each printed thing you could not read with certainty: blurred or cut-off text, a digit that could be two different numbers, a line that could belong to another recipe. It is only about the title, the servings, the ingredient lines and the steps. Doubt about dishType or proteinType does not belong here; choose "unbekannt" or "unknown" there instead. Every entry makes a person check the recipe by hand, so add one only when a person really has to decide something. A page you read without doubt has an empty list.
- notes: observations that need no decision, such as a tip box or neighbouring recipe you left out, or a difference between the steps and the ingredient list. A title, page number or time that is simply not on the photo is not uncertain: return null and, at most, mention it here.`;

/**
 * Instructions for the second pass. It has to know how the transcription is written, or it
 * would report the conventions as mistakes.
 */
export const VERIFICATION_PROMPT = `You check a transcription of a German recipe against photos of the printed page. Someone else made the transcription, and it can contain mistakes. A mistake that slips through puts the wrong thing on a family's shopping list.

How to check
1. Go through the recipe's ingredient list on the photo, line by line. For each printed line, find its entry in the transcription and compare amount and unit with the print, character by character. Look hardest at fractions (½, ¼, ¾), ranges ("2–3") and digits that look alike.
2. Check that every printed ingredient line has an entry, and that the transcription has no entry that is not printed in this recipe's ingredient list. Tip boxes, sidebars and neighbouring recipes are not part of the list.
3. Check title, servings, page number and preparation time.
4. Check the steps as described below.

How the transcription is written. These are conventions, not mistakes:
- Quantities are decimals: ½ is 0.5, 1 ¼ is 1.25. A range has its lower number in quantity and its upper in quantityMax.
- A count without a printed unit has the unit "Stück". Unit spellings are normalised ("El" is EL). A small container that is not a unit of its own ("Döschen", "Briefchen", "Tütchen", "Päckchen", "Tube", "Flasche") is written as Packung.
- A title printed all in lower case or all in capitals is written with normal German capitalisation.
- servingsUnit is null when the recipe's amounts are for persons or portions. When the print counts what the recipe makes instead, such as a cake tin, a baking tray or pieces ("Zutaten für 1 Springform (Ø 26 cm)", "ergibt 20 Stück"), servingsMin and servingsMax are that number and servingsUnit is what is counted, as printed. How servingsUnit is spelled or capitalised is never a mistake. Report servings when a number differs from the print, or when persons and something else are mixed up.
- No printed quantity means quantity and unit are both null.
- Two ingredients printed on one line are two entries. An alternative ("oder ...") is its own entry with alternativeTo pointing at the entry it can replace.
- Where the name ends and the note begins is a judgment call. Never report it.
- A counted unit that is part of the ingredient's word ("4 Basilikumblättchen", "2 Knoblauchzehen") may be written as that unit (Blatt, Zehe) or as Stück. Both are correct.
- A size instead of an amount ("3 cm Ingwer", "1 walnussgroßes Stück") is written as quantity 1, unit Stück, with the size in the note.
- A second measure in brackets has secondaryScope "unknown" unless the print says per piece or in total.
- approximate refers to the main amount only.
- prepMinutes leaves out waiting times printed as an extra.
- title, page or prepMinutes are null when they are not visible on the photos. That is correct if they really are not visible.

${STEP_CHECK_RULES}

What to report
Report a problem only when the photo clearly shows something different from the transcription. For each one give the position of the entry (ingredientIndex, or null for a recipe field, a missing line or a step; stepIndex for a step), the field, what the photo shows (printed, quoted exactly) and what the transcription says (transcribed). If everything matches, return an empty list. Do not report anything you are not sure you can see on the photo.`;

/** Instructions for suggesting where an ingredient the catalog does not know would go. */
export const SUGGESTION_PROMPT = `You help a German household maintain the ingredient catalog behind their shopping list. Recipes they imported use ingredients the catalog does not have yet. For each one, suggest an entry. A person confirms every suggestion, so say what is most likely and do not hedge.

For each unknown ingredient
- sameAs: if it is the same product as an ingredient already in the catalog, only written differently (another spelling, singular or plural, a regional word such as "Porree" for "Lauch"), give that catalog name exactly as listed. If it is a different product, even a similar one, give null.
- aisleGroup: where it is found in a German supermarket, chosen from the household's groups.
- buyingMode: how the amount matters when buying it. "count" when one buys a number of pieces (3 Paprika), "weight" when one asks for a weight (500 g Hackfleisch), "pack" when it comes in packs of a fixed size (a 200 g tub), "none" when the name on the list is enough (a bunch of herbs, a jar of spice).
- defaultUnit: the unit recipes mostly give it in. packSize: the usual pack size in that unit, only for "pack".
- isPantryStaple: true for things a household usually has at home, such as spices, oil, flour.
- shelfLifeDays: how many days it stays good at home after buying. Null when it keeps for weeks or longer.

Return one suggestion per unknown ingredient, with its name exactly as given.`;

/** Instructions for the first look at a page, which only sorts pages into recipes. */
export const SURVEY_PROMPT = `You look at one photo from a German cookbook or food magazine and report which recipes are on it. The photo shows one page or a double page. This is a first look to sort pages into recipes. Do not transcribe ingredients or amounts.

- printedPage: the page number printed on the page. If a double page shows two numbers, give the lower one. Null if no page number is visible.
- recipes: one entry, in reading order, for each recipe that has its title or its ingredient list on this photo.
  - title: the recipe's printed title if it is on this photo, otherwise null. Chapter and section headings such as "Salat & Gemüse" are not recipe titles. If the book prints titles all in lower case or all in capitals, write them with normal German capitalisation.
  - page: the number printed on the page this recipe is on. On a double page that is the number on the recipe's own side. Null if it is not visible.
  - hasIngredientList: true if this recipe's ingredient list is on this photo.
  - hasSteps: true if its preparation steps are on this photo.
  - continuesOnNextPage: true only if the recipe's text visibly breaks off at the end of the page.
- Steps or an ingredient list without a title on the photo are still a recipe entry, with title null. The title is then on another page.
- A recipe that is only partly visible at the edge of the photo, because it belongs to the neighbouring page, does not count.
- A photo without any recipe (cover, table of contents, introduction, a full-page picture, a chapter opener) has an empty recipes list. Say in otherContent, in German and in a few words, what it shows. Otherwise otherContent is empty.`;

/** Instructions for telling how a page photo lies and where its recipes are. */
export const FRAME_PROMPT = `You look at one photo of a page or double page from a German cookbook, magazine or recipe folder. You say how the photo lies and where its recipes are. Nothing is transcribed.

- textTop: where the top of the text is in this photo.
  - "top": the text reads normally, from left to right.
  - "right": the page lies on its right side. The lines run from the top of the photo to its bottom, and the tops of the letters point to the right edge.
  - "left": the page lies on its left side. The lines run from the bottom of the photo to its top, and the tops of the letters point to the left edge.
  - "bottom": the text is upside down.
  Judge by the main text of the recipes, not by a page number, a book spine or a caption that is set sideways on purpose.
- recipes: one entry for each recipe title you are given, with the title exactly as given and the box that holds everything of that recipe on this photo: its title, its ingredient list, its steps, and its picture if it has one. left and right are fractions of the photo's width counted from its left edge, top and bottom fractions of its height counted from its top edge, all between 0 and 1, in the photo as it is.
  - Nothing of the recipe may be cut off. A little of a neighbouring recipe inside the box does no harm.
  - If the parts of a recipe do not lie together, for example because its text runs on in another column behind another recipe, or if you cannot tell where it ends, give the whole photo: 0, 0, 1, 1.
  - A recipe that fills the photo has the box 0, 0, 1, 1.`;

export const UPRIGHT_PROMPT = `You are shown one photo of a page from a German cookbook, magazine or recipe folder four times: copy A as it was taken, and B, C and D each a quarter turn further. Exactly one copy is upright. You say which.

- In the upright copy the recipe text reads normally: the lines run from left to right and the letters stand on their feet.
- In one other copy the lines also run from left to right, but the letters stand on their heads. Do not go by the direction of the lines alone. Read letters: a title, or the numbers and units of an ingredient list.
- Judge by the text of the recipes, printed or handwritten. Ignore a page number, a book spine, a caption set sideways on purpose, and another sheet or a tablecloth that shows behind the page.
- words: a few words you can read in the copy you choose, as they are written there.
- upright: the name of that copy.`;

/** Added to the reading instructions when the recipe comes as text instead of as a photo. */
export const PASTED_TEXT_NOTE = `This time the recipe does not come as photos. It is text someone copied from a website, a message or a document and pasted in. Everything above applies with "the text" in place of "the photos":
- "raw" is the line as it stands in the text.
- The text may contain more than the recipe: navigation, advertising, comments, ratings, a story before the recipe. None of that belongs to it.
- If the text holds several recipes, read the first complete one and say so in "notes".
- If the text is no recipe at all, return no title and no ingredients and say so in "uncertain".
- "page" is null.
- A step that the text spreads over several lines is still one entry. A text without preparation steps has an empty list.`;

/**
 * Instructions for reading the steps of a recipe that is in the library already: its
 * ingredients were read and checked when it was imported, only the steps are new.
 */
export const STEPS_PROMPT = `You read the preparation steps of one German recipe from photos of cookbook, magazine or recipe folder pages. A family cooks from them in the kitchen instead of from the book, so every step must be complete and every number right. The title, servings and ingredients have been read already; return the steps only.

Every image has a label. "Page 1", "Page 2" and so on are photographed pages of the recipe. "Cut-out of Page 1" shows the part of that page where the recipe meant stands. The steps can go on outside the cut-out, in another column of the page, so always follow them on the page itself to their end.

${STEP_RULES}

uncertain and notes, both written in German because the family reads them
- uncertain: one entry for each part of the steps you could not read with certainty, with the field "steps". A step you read without doubt needs none. Every entry is shown to the family next to the step.
- notes: observations that need no decision, such as a tip box you left out.`;

/** Instructions for checking steps read from photos of a recipe that is in the library. */
export const STEPS_VERIFICATION_PROMPT = `You check a transcription of the preparation steps of a German recipe against photos of the printed page. Someone else made the transcription, and it can contain mistakes. A family will cook from it instead of from the book.

"Page 1", "Page 2" and so on are the photographed pages. "Cut-out of Page 1" shows where the recipe meant stands; its steps can go on outside the cut-out, on the page.

${STEP_CHECK_RULES}

What to report
Report a problem only when the photo clearly shows something different from the transcription, with what the photo shows (printed, quoted exactly) and what the transcription says (transcribed). If everything matches, return an empty list. Do not report anything you are not sure you can see on the photo.`;

export const TAGGING_PROMPT = `You describe German recipes with a few tags for a family's meal planner. For each recipe you get one numbered line: its title, its category if it has one, the time its cookbook prints if it prints one, and its ingredients. You return one entry per recipe with the same number.

The tags help the family browse and keep long cooking out of working days. A wrong tag is worse than a missing one: where the line does not say enough, leave the list empty or the value null. Only "effort" always has a value.

- effort: how much work and time the dish is, all in all, from starting to cook to eating.
  - "schnell": on the table in about 30 minutes, little preparation. A pan dish, pasta with a quick sauce, a salad, a sandwich.
  - "alltag": fits a normal day, 30 to 60 minutes, or longer with the oven doing the work and little to do meanwhile.
  - "aufwendig": takes more than an hour of attention or several hours in all, or many steps: a roast, braised meat, yeast dough, a layered cake, stuffed or rolled dishes, homemade pasta or dumplings.
  A printed time often counts only the work at the stove and leaves out baking, braising, resting or chilling. Go by what the dish needs in all.
- dish: what kind of dish it is. Any that clearly fit, mostly one or none.
  - "pasta": pasta, noodles, gnocchi, spätzle as the main part.
  - "reis": rice or grains as the main part: risotto, fried rice, couscous, bulgur.
  - "kartoffeln": potatoes as the main part.
  - "auflauf": baked in a dish with a topping: casserole, gratin, lasagne.
  - "pizza": pizza, quiche, tarte flambée, savoury tart.
  - "pfanne": cooked in a pan or wok in one go.
  - "ofen": roasted or baked in the oven and none of the above: a roast, a tray bake.
  - "burger": burgers, wraps, sandwiches, filled flatbreads.
- cuisine: one of "deutsch" (German, Swabian, Austrian home cooking), "italienisch", "mediterran" (Greek, Spanish, southern French), "asiatisch", "orientalisch" (Middle East, North Africa, Turkey, India counts as "asiatisch"), "amerikanisch" (US, Tex-Mex, Mexican). Null when the dish belongs to none in particular.
- seasons: only for a dish that depends on a season's produce or belongs to a time of year: asparagus or rhubarb are "fruehling", grilling, berries or a cold soup "sommer", pumpkin, game or mushrooms "herbst", cabbage, stews with root vegetables or Christmas baking "winter". Most dishes have none.
- occasions: "fuer-gaeste" for a dish that is made to impress or to serve many, "fest" for a Sunday roast or holiday meal, "grillen" for the barbecue, "mitnehmen" for what travels well cold (a picnic, a lunch box), "weihnachten" for Christmas baking and Christmas dishes. Most dishes have none.`;
