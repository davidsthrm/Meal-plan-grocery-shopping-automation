# Import

How recipes get into the library: photos, pasted text or typed, read by a model on the server,
checked twice, and looked at by the household only where the reading was doubtful. This covers
the model and budget rules, the upload, the steps of an import, review, framing of photos and the
measurements. Checking the whole library is in
[RECIPES.md](RECIPES.md#looking-after-the-library-prüfen-and-duplicates).

## Rules that hold

- Recipe import uses the Anthropic API, server side only. Model IDs come from
  `ANTHROPIC_EXTRACT_MODEL` and `ANTHROPIC_VERIFY_MODEL`. Never hard-code a model ID.
- Budget: at most 2 cents per recipe for both passes. A recipe the cheap model cannot read with
  certainty goes to the review queue. It is never handed to a pricier model automatically.
- Every model call goes through the `RecipeReader` type in `src/server/import/read-recipe.ts`.
- Never guess. A value the model cannot read with certainty is null, and the model says so in
  `uncertain`.
- Model instructions live in `src/server/import/prompt.ts`. Their examples must not come from
  the sample recipes, or the measurements stop meaning anything.
- Re-measure after changing a prompt or a model.

## Model, budget and evals

- Recipe import uses the Anthropic API, server side only. Model IDs come from
  `ANTHROPIC_EXTRACT_MODEL` and `ANTHROPIC_VERIFY_MODEL`. Never hard-code a model ID.
- Budget: at most 2 cents per recipe for both passes. Start with `claude-haiku-5-5`. A recipe
  the cheap model cannot read with certainty goes to the review queue. It is never handed to
  a pricier model automatically.
- Every model call goes through the `RecipeReader` type in `src/server/import/read-recipe.ts`.
  Another model or provider gets its own reader; nothing else in the import changes.
- Which model is good enough is decided by `npm run import:eval`, on the household's own
  sample recipes, not by assumption.
- Model instructions live in `src/server/import/prompt.ts`. Their examples must not come from
  the sample recipes, or the measurements stop meaning anything.

## Adding recipes

- Recipes are added on `/rezepte/hinzufuegen` (`AddRecipe`), from the top of the Import tab
  or from "Rezept hinzufügen" on a meal planned as text: "Foto aufnehmen" is the camera
  itself (`capture="environment"`), "Fotos wählen" the gallery, many at once, "Text
  einfügen" and "Eintippen" open `/rezepte/neu`. The photos, more taken or picked, and the
  cookbook or magazine with its edition (one field, required), then "Fertig": the photos go
  to Storage three at a time, and `/api/import/[batchId]/run` answers at once and reads the
  batch on the server after the answer (`after`, `runBatch`, about four minutes:
  `afterStep`). A run that runs out of time hands the batch on to a new one with the same
  login while it is good for more than six minutes, thirty runs at most (`handOn`); it never
  renews the login, which would compete with the phone's. The phone can be put away. What
  is read without doubts is in the library, and on its meal where it was added from one
  (`placeForMeal`); what has doubts waits under Import → Prüfen, and approving it plans it.
  Anything left is read when the batch page is open. Measured (October 2026): one photo on
  its meal 42 s after "Fertig"; two photos through five runs of a minute
  (`IMPORT_RUN_BUDGET_MS=62000`, only to try the handing on), one taken over, one to check.
- Recipes are added on an upload tab in the app. The model detects title and kind. The
  household enters what a photo cannot show: cookbook and, if not printed, the page. The
  cookbook is asked once per batch and pre-filled from the folder name when a folder is chosen.
  In a magazine's stack the folder is the edition (see "Library" in the main docs).
- What a photo cannot show comes from the upload form: the cookbook always, title and page
  when they are not printed. The printed title stays in `source_title`; a title the household
  entered never overwrites it.

## Photos and storage

- Photo uploads go from the browser straight to Storage. The server turns each one into an
  upright JPEG without metadata (the photos carry GPS). sharp cannot decode iPhone HEIC, so
  those go through `heic-decode` first. See `src/server/import/normalize-image.ts`.
- A 24 megapixel page loses more than half its resolution at the model's size limit. The
  import can send enlarged full-resolution parts along with the page (`prepareForModel`).
- The photo bucket has no storage policies. Uploads and views go through signed URLs from the
  server. The upload from the phone is deleted as soon as the clean JPEG is stored.
- A photo may show several recipes, such as a double page with four. Each becomes its own
  job that says which recipe is meant, by position in reading order and by title. Such a photo
  is read from the page plus enlarged parts at full size, because the print is too small
  otherwise. A clean full-size copy is kept for that and removed when the batch is through.
  Measured on a made-up double page with four sample recipes: read from the page alone, one
  fraction was misread; with enlarged parts all were correct, at about 0.95 cents per recipe.
- The first look notes the page number of each recipe's own side, so the two recipes of a
  double page get their own page numbers.

## The steps of an import

- The steps, in `src/server/import/import-recipe.ts`: normalise the photos, read them (first
  pass), map every line to the catalog, run the automatic checks, let a second request compare
  the transcription with the photos (second pass), then decide.
- The second pass never sees the printed lines of the transcription, only the values.
  Otherwise it would compare the transcription with itself instead of with the photo.
- Never guess. A value the model cannot read with certainty is null, and the model says so in
  `uncertain`. Observations that need no decision go to `notes` and never block approval.
- What was read must always be storable. A recipe that waits for review can contain anything
  a model returned, so the stored rows are made valid (an amount without a known unit becomes
  a count, a broken range loses its upper bound) and the checks flag each case. If the
  database still refuses a recipe, the job is marked failed with the reason. It is never put
  back in the queue: a failure that repeats would stop the batch at the same recipe forever.
- Only an outage puts a step back in the queue. A rate limit of the model service is answered
  with "throttled"; the batch page waits and carries on by itself.

## Review and doubts

- The household only looks at recipes that were not read with certainty. A recipe goes to the
  review queue when something about the reading is doubtful: no title or servings, a line the
  model was unsure about, an amount without a unit or far too large, or the second pass
  seeing something different. A recipe the second pass could not check is never approved.
- An ingredient the catalog does not know is not a reason for review, and neither is doubt
  about the category. The recipe was read correctly; only the catalog is behind. Measured on
  the first real cookbook: 100 of 118 recipes waited for nothing but unknown ingredients.
- Review (`/import/pruefen`) shows photo and fields side by side. Everything typed is checked
  again on the server by `readReview`. Approving replaces the recipe's lines.
- Checking the whole library ("Prüfen" on the import page) and duplicates: see
  [RECIPES.md](RECIPES.md#looking-after-the-library-prüfen-and-duplicates).

## Servings and units

- What a recipe's amounts are for is decided by its printed servings line, which the model
  copies into `servingsRaw` (`src/domain/import/servings.ts`). A line that counts persons
  keeps the numbers the model read. A line that counts something else ("Zutaten für 1
  Springform (Ø 26 cm)", "ca. 20 Stück") gives the number and the unit. A line the app cannot
  interpret assumes nothing and sends the recipe to review. Measured on the first four
  cookbooks: 654 lines, 485 for persons, 46 for something else, none unclear, 123 recipes
  without a line.
- The check for amounts that are far too large counts a recipe with a unit as twelve
  portions, or 1.5 kg of fruit for one tray would look like a misreading.
- "Handvoll" is a unit. A length ("2 cm Ingwer") is a size, stored as one piece with the
  size in the note.
- Titles printed all in lower case or capitals are stored with normal German capitalisation.
  A small container that is no unit of its own ("Döschen", "Briefchen") is a Packung.

## Mapping to the catalog

- Mapping to the catalog: the longest part of the printed line that contains the ingredient's
  name and is a catalog name wins ("1 getrocknete Chilischote" is not the fresh one).
- A cut of something bought by the piece is that thing (`wholeOfCut`): "Zitronenscheiben"
  are lemons in slices, "Zitronenachtel" an eighth of a lemon ("Scheibe", "Achtel",
  "Viertel"). Halves are not: "Pfirsichhälften" come in a tin. A product of its own sold in
  slices ("Toastscheiben", "Käsescheiben") is found by its own name first. The import had
  made six such cuts ingredients of their own; they were merged once.
- A line without an amount that names several ingredients the catalog knows one by one is
  split after reading (`splitJoinedLines`): "Salz und Pfeffer" is salt and pepper. The
  household had "Salz & Pfeffer" as an ingredient in 264 recipe lines before. Typed recipes
  are split the same way.
- Singular, plural and a leading "Bio-" are the same product ("Lachsfilets", "Bio-Gurke").
  The import maps them by itself, and proposals the catalog can answer by now are closed
  before the list is shown. Short words get no such variants: "Ei" is not "Eis".

## New ingredients

- An ingredient the catalog does not know is never created silently. It becomes one open
  proposal per product: either another name for an existing ingredient, or a new one with a
  suggested aisle group, shop, buying mode and shelf life. Until it is decided, its recipe
  lines keep their ingredient empty, and the shopping list buys them by the name they are
  proposed with (`RecipeIngredient.proposedName`, as the recipe's form shows them), or
  without a proposal by the name in the printed line (`productName`: brackets are a note,
  and a comma ends the name only after its noun, so "grüne, paprikagefüllte Oliven" are not
  "grüne"), scaled with the meal like any other line, what is counted rounded up to whole
  pieces: "0,75 Seele" for one person stood on the list as
  printed for a meal of four (October 2026). Such a line is under "Sonstiges" at the
  supermarket until the proposal is confirmed. A proposal's "same as" is never taken from a
  similar spelling (`SUGGESTION_PROMPT`): the model offered "Seezungenfilets" for "Seele",
  the Swabian roll, and confirming all at once would have put sole on the list.
- Before "Neue Zutaten" is shown, the open proposals are put in order (`tidyProposals`):
  a name loses an amount in front and a note after a comma ("200 g Belugalinsen" is
  "Belugalinsen"), two proposals for one product become one with all their recipe lines,
  one the catalog can answer by now is answered, also behind words that only describe a
  product (`mapDescribed`: "kleines Bauernbrot" is Brot; size, freshness, ripeness, organic,
  seedless, green), and one no recipe waits for any more is not shown. A recipe's form
  shows an unknown line under its proposed name, not as printed: saved as printed, it was
  proposed a second time.
- "Neue Zutaten" is one list. Every row has the suggested decision already set: a new
  ingredient with its aisle, another name for an existing one, not for the catalog, or later.
  The household changes what is wrong and confirms everything with one button. The
  suggestions "same as an existing ingredient" are listed first, because a wrong one there
  would quietly put the wrong product on shopping lists.

## Batches and grouping pages

- A batch is one sitting with one cookbook: any number of page photos, in page order. Each
  request does one step and records it (`src/server/import/batch.ts`): look at a page, group
  pages into recipes, import a recipe. The batch page drives this with three requests side by
  side. A closed tab loses nothing; a step abandoned for five minutes is done again.
- Pages are grouped into recipes by `groupPages`: complete on one page, title and ingredients
  on facing pages in either order (page numbers decide which pages face each other), or
  running on to the next page. Pages without a recipe are left out and shown as such.
- A batch is finished only when every page that holds a recipe belongs to a recipe job and no
  job waits. While another request is still grouping the pages, the answer is "waiting".
- A batch can be deleted. Its pages, photos and the recipes read from it go; ingredients
  confirmed along the way stay.

## Framing photos

- When the recipes of a batch are read, its page photos are made presentable, one page per
  request (`frameNextPage`): turned upright in place and, where a page holds several
  recipes, cut into one view per recipe (`recipe_photo.crop_path`, stored under `crops/` of
  the batch). `framed_at` marks a page as done. This does not hold up review: the batch
  counts as read, and the batch page says how many photos are still open (`photosWaiting`).
- How a page lies is asked as a choice (`framePage`): the model sees the photo in its four
  turns and names the upright one, then a second request locates the recipes on that copy
  and has to find the text upright there too. If the two disagree, the photo stays as it was
  taken and is shown whole. Asked about one photo alone ("where is the top of the text?"),
  the model mixed up the two sides and took an upside-down page for upright.
- Showing too much of a page is harmless, cutting something off is not (`cropFor`): a box
  that makes no sense or covers most of the page is not used, a page with one recipe is never
  cut, and the whole page stays one tap away.
- A page the model cannot frame keeps its photo and is not tried again. Only an outage puts
  it back, as with every other step.

## Steps (preparation steps)

- The reading copies the steps as well (`STEP_RULES`, shared with the reading of steps alone).
  The second pass checks them for structure and numbers, not word by word: every printed step
  there and in order, none from a tip box, each read to its end across columns, and every
  time, temperature and amount as printed (`STEP_CHECK_RULES`). A step with "[…]", one that
  breaks off mid-word or on a comma, or no steps where the first look at the page saw some
  (`stepProblems`, `surveySawSteps`) send a recipe to review.

## Measurements

- Measured on the five sample photos with `claude-haiku-5-5` (October 2026): 15 of 15 readings
  without a mistake over three runs, 25 of 25 planted mistakes caught by the second pass, no
  false alarm, about 0.35 cents per recipe for both passes. Re-measure after changing a prompt
  or a model.
- Measured with steps (October 2026): ingredients still 5 of 5 without a mistake; 20 of 22
  steps exactly as printed, the other two with one word normalised ("einkochen" for
  "einköcheln", "Stengelansätze"), no number wrong; 38 of 38 planted mistakes caught, the 13 in
  the steps included, no false alarm; 0.43 cents per recipe for both passes, 0.08 more than
  without steps. Reading the steps alone from a stored page: 0.21 cents for both requests, the
  same two words, stable over three runs. The steps of the five samples are transcribed by hand
  in the fixtures. Re-measured after "plaetzchen" joined the kinds of dish (October 2026):
  ingredients 5 of 5 without a mistake, the same two words in the steps, 0.30 cents per recipe
  for the reading.
- Framing, measured with `claude-haiku-5-5` (October 2026), every photo laid on each of its four
  sides: 20 of 20 sample pages and 63 of 64 pages from the household's own folder came back
  upright, one was left as it was, none was turned wrongly, at about 0.1 cents per page.
  Asked about one photo alone it was 19 of 20 and 60 of 64, and one stored page ended up on
  its head. The library's 492 pages: 67 turned upright, 602 of the 629 recipes that share a
  page got a view of their own.
- Enlarged parts of a double page: see "Photos and storage" (about 0.95 cents per recipe).
- Servings lines on the first four cookbooks and unknown ingredients on the first real
  cookbook: see "Servings and units" and "Review and doubts".
- Adding a recipe on its meal (October 2026): see "Adding recipes".
