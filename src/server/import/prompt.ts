/**
 * Instructions for reading one recipe from photos. The rules mirror the fields of
 * `extractedRecipeSchema`; the examples are deliberately not taken from the sample recipes
 * the models are measured on.
 */
export const EXTRACTION_PROMPT = `You read German recipes from photos of cookbook and magazine pages and return them as structured data for a family's shopping list app. A wrong amount puts the wrong thing on their shopping list, so reading correctly matters more than returning something for every field.

Every image has a label. "Page 1", "Page 2" and so on are photographed pages of the same recipe. An "Enlarged part" shows a piece of a page at higher resolution; use it to read small print such as fractions. Enlarged parts overlap, so one printed line can appear in two of them. It is still one line.

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

/**
 * Instructions for the second pass. It has to know how the transcription is written, or it
 * would report the conventions as mistakes.
 */
export const VERIFICATION_PROMPT = `You check a transcription of a German recipe against photos of the printed page. Someone else made the transcription, and it can contain mistakes. A mistake that slips through puts the wrong thing on a family's shopping list.

How to check
1. Go through the recipe's ingredient list on the photo, line by line. For each printed line, find its entry in the transcription and compare amount and unit with the print, character by character. Look hardest at fractions (½, ¼, ¾), ranges ("2–3") and digits that look alike.
2. Check that every printed ingredient line has an entry, and that the transcription has no entry that is not printed in this recipe's ingredient list. Tip boxes, sidebars and neighbouring recipes are not part of the list.
3. Check title, servings, page number and preparation time.

How the transcription is written. These are conventions, not mistakes:
- Quantities are decimals: ½ is 0.5, 1 ¼ is 1.25. A range has its lower number in quantity and its upper in quantityMax.
- A count without a printed unit has the unit "Stück". Unit spellings are normalised ("El" is EL).
- No printed quantity means quantity and unit are both null.
- Two ingredients printed on one line are two entries. An alternative ("oder ...") is its own entry with alternativeTo pointing at the entry it can replace.
- Where the name ends and the note begins is a judgment call. Never report it.
- A second measure in brackets has secondaryScope "unknown" unless the print says per piece or in total.
- approximate refers to the main amount only.
- prepMinutes leaves out waiting times printed as an extra.
- title, page or prepMinutes are null when they are not visible on the photos. That is correct if they really are not visible.

What to report
Report a problem only when the photo clearly shows something different from the transcription. For each one give the position of the entry (ingredientIndex, or null for a recipe field or a missing line), the field, what the photo shows (printed, quoted exactly) and what the transcription says (transcribed). If everything matches, return an empty list. Do not report anything you are not sure you can see on the photo.`;
