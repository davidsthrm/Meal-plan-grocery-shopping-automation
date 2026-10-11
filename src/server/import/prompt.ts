/**
 * Instructions for reading one recipe from photos. The rules mirror the fields of
 * `extractedRecipeSchema`; the examples are deliberately not taken from the sample recipes
 * the models are measured on.
 */
export const EXTRACTION_PROMPT = `You read German recipes from photos of cookbook and magazine pages and return them as structured data for a family's shopping list app. A wrong amount puts the wrong thing on their shopping list, so reading correctly matters more than returning something for every field.

The first image is the whole page. Further images, if there are any, are enlarged parts of the same page at higher resolution. Use them to read small print such as fractions. They overlap, so one printed line can appear in two of them. It is still one line.

What belongs to the recipe
- Read exactly one recipe. Parts of a neighbouring recipe, tip boxes, shopping hints, sidebars and handwritten notes in the frame are not part of it. Mention them in "notes" and do not turn them into ingredients.
- Return only what is printed on the photos. If the title, the servings, the page number or the preparation time is not visible, return null for it. Never derive a title from the steps or the ingredients.
- If you cannot read part of a line with certainty, return null for that part, set "unclear" to true on the line and say in "uncertain" what is unclear. Never fill in a likely value.

Ingredients: one entry per ingredient, in printed order
- raw: the line exactly as printed, with its amount and brackets.
- quantity: a decimal number. ½ is 0.5, ¼ is 0.25, ¾ is 0.75, 2 ½ is 2.5.
- A range such as "1–2 Zwiebeln": the lower number in quantity, the upper in quantityMax. Otherwise quantityMax is null.
- unit: one of the allowed units. A count without a printed unit ("3 Eier", "Zitrone ½") has the unit "Stück". Printed variants map to the allowed spelling: "Essl." is EL, "Teel." is TL, "Pck." is Packung, "Dosen" is Dose.
- No quantity printed ("Zucker", "Öl zum Braten"): quantity and unit are both null.
- A size instead of an amount ("1 faustgroßes Stück Sellerie"): quantity 1, unit "Stück", and the size words go to note.
- name: the ingredient as printed, without its amount. Words that only describe preparation or quality ("gehackt", "reif", "frisch gemahlen") go to note.
- approximate: true when the main amount is printed with "etwa", "ca." or "ungefähr" ("ca. 500 ml Milch"). An "etwa" that belongs to a second measure in brackets does not count.
- Two ingredients on one printed line ("Zimt und Zucker"): two entries with the same raw.
- A second measure for the same line ("1 Dose Tomaten (400 g)", "2 Filets à 180 g"): put it into secondaryQuantity and secondaryUnit. secondaryScope is "perPiece" when the print says so ("à", "je"), "total" when the print says so ("insgesamt", "zusammen"), and "unknown" otherwise. Do not decide yourself whether a weight in brackets is per piece or in total. Without a second measure: null, null and "none".
- An alternative ("Butter oder Margarine", "1 Bund Dill (oder 1 TL getrockneter Dill)"): one entry for the first ingredient and a second entry for the alternative, with alternativeTo set to the position of the first entry, counting from 0. Both share the same raw. All other entries have alternativeTo null.
- optional: true only when the recipe itself says the ingredient can be left out. Recipes often say this in the steps rather than in the list ("wer mag", "nach Belieben", "kann man weglassen"), so read the steps for it.

Recipe fields
- servingsMin and servingsMax: "für 4 Personen" is 4 and 4, "für 2–3 Personen" is 2 and 3.
- prepMinutes: the printed preparation time in minutes, without waiting times printed as an extra ("+ 1 Std. Kühlzeit").
- dishType and proteinType: your judgment from the recipe as a whole. Meat stock or bacon makes a dish non-vegetarian.
- subtitle, servingsRaw and note are empty strings when there is nothing to put there.

uncertain and notes, both written in German because the family reads them
- uncertain: one entry for each thing you could not read or decide with certainty: blurred or cut-off text, a digit that could be two different numbers, a line that could belong to another recipe. Every entry makes a person check the recipe by hand, so add one only when a person really has to decide something. A page you read without doubt has an empty list.
- notes: observations that need no decision, such as a tip box or neighbouring recipe you left out, or a difference between the steps and the ingredient list. A title, page number or time that is simply not on the photo is not uncertain: return null and, at most, mention it here.`;
