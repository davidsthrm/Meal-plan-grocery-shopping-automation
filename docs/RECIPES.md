# Recipes

The recipes of the household: their units and how amounts convert and scale, how they are
described, corrected and cooked from, and the library the family browses, searches and looks
after.

## Units and conversion

- Base units are g and ml. EL = 15 ml, TL = 5 ml.
- Mass and volume convert only through an ingredient's own density. Counted units (Stück,
  Bund, Zehe, Dose, ...) convert only through the ingredient's own grams-per-unit values.
- If two amounts of one ingredient cannot be converted, keep separate lines. Never guess.
- The exception is a spoonful or a pinch (EL, TL, Prise, Msp) that cannot be converted: it
  counts as "some" on the ingredient's line. Otherwise three tablespoons of butter would be
  the line "55 ml Butter".
- The other exception: slices of something bought by the piece that the catalog cannot weigh
  buy whole pieces, one for every eight slices (`SLICES_PER_PIECE`, `shoppingAmount`).
  "2 Zitronenscheiben" are "1x Zitrone"; the line was "2 Scheiben Zitronenscheiben"
  (October 2026).
- "Stiel", "Stiele" and "Stielen" are the unit Stängel (`parseUnit`). A recipe line printed
  in stalks is counted in Stängel and the word stays out of its note (`stalksAsStaengel`),
  wherever the reading put it.
- A quantity range ("2-3") counts with its upper bound for shopping.
- An alternative ingredient ("oder Petersilie") never reaches the list.

## Servings and scaling

- Scale by slot servings / base servings. Base servings can be a range such as 4 to 6. If the
  slot servings fall inside the range, the recipe is cooked as written.
- A drink or a syrup makes a volume ("Für 2,25 l"). Servings are whole numbers, so a volume
  is kept in millilitres (2250 "ml", `VOLUME_UNIT`), read from a printed line and from "2,25"
  "Liter" in the forms (`volumeYield`), and shown in litres from one litre on.
- Base servings count persons unless the recipe has a servings unit. Baking and finger food
  count what they make: 1 "Springform (Ø 26 cm)", 1 "Backblech", 40 "Stück". The unit is free
  text as printed, null for persons (`recipe.servings_unit`, `Servings.unit`).
- A recipe for persons is planned for the household's servings. A recipe with a unit is
  planned as written (`plannedServings`): scaled to four persons, a recipe for one cake tin
  would bake four cakes. Someone who wants two trays sets the slot to 2.
- A recipe's page has a stepper next to "Zutaten" (`ServingsScale`, `ServingsStepper`): the
  ingredients, the amounts inside the steps and the view for cooking follow it in the
  browser, kept in the address (`?portionen=`). It starts with the household's servings
  (`plannedServings`: a recipe with a unit as written), and opened from a planned meal with
  that meal's, its extra portions included (`fromPlan`, `cookedServings`). Amounts are
  rounded as a cook measures (`cookingAmount`: 135 g, 1½ EL, ⅓ Zwiebel, whole eggs) and a
  changed one is marked (`.scaled`); "Wie gedruckt zeigen" shows the steps as printed.
- A number in a step is scaled only where it is an amount (`scaleStep`,
  `src/domain/scaling.ts`): a weight or volume, a counted unit with one of the recipe's
  ingredients behind it, or one of them itself ("2 Eier"), past adjectives only. Never a
  size, a time, a share ("⅔ der Kräuter"), an amount per piece ("je 2 Scheiben", "à 150 g"),
  a form or tray, or a number written as "ein". Where singular and plural would change and
  the other word is not known, or an adjective would have to change its ending, the step
  stays as printed. Measured on the household's 4,724 steps at 6 instead of 4 persons
  (October 2026): 1,273 amounts scaled; of about 100 read by eye all were amounts or things
  that grow with the meal ("8 Holzspieße", "4 Teigstücke"), none a size, time or share.

## Categories

- A recipe has at most one category: Hauptgericht, Suppe & Eintopf, Salat, Beilage, Vesper,
  Snack & Fingerfood, Dessert & Süßspeise, Kuchen & Gebäck, Plätzchen & Kekse, Frühstück,
  Getränk, or Soße, Dip & Grundrezept. Plätzchen are sweet like cakes (Sunday's coffee, the
  colour); the check of the library knows drinks and cookies by the last part of a title
  ("Erdbeer-Holunder-Bowle", "Lebkuchen-Kipferl"; "Lebkuchen-Mousse" is a mousse). A
  category is a tag of the group "Kategorie" with a stable `key`. The import's `dishType` is
  that key. Find such tags by key, never by name: the household may rename them. A new
  category needs a migration that adds its tag to every household, an entry in `DISH_TYPES`
  and a line in the reading instructions.

## Editing and typing recipes

- The household may rename a recipe and edit its ingredients. The printed text is kept in
  `original_text` and `source_title`.
- Any recipe can be corrected on `/rezepte/[id]/bearbeiten`, its ingredient lines included.
  The lines are the rows of the import's review (`IngredientRows`, shared by both forms):
  amount, unit, ingredient and note per row, the printed line shown above it. What is typed
  is checked on the server by `readReview`, and saving replaces the recipe's lines.
- A recipe typed in by hand (`readTypedRecipe`) has one ingredient per line, written as on a
  shopping note: "200 g Spaghetti", "2-3 Tomaten", "Parmesan". A number without a unit counts
  pieces, what follows a comma is a note. It is approved at once, and a quick meal unless a
  cookbook is named. Unknown ingredients become proposals, as in the import.

### Pasted recipes

- A recipe can be pasted as text (`/rezepte/neu?art=text`): the reading model reads it by
  the rules for photos (`createAnthropicTextReader`), and what it read fills the form for a
  typed recipe (`pastedRecipe`), where a person checks it before anything is saved. What
  needs a look is listed above the form: no title, no servings, a line the model was unsure
  about, an alternative that was left out, no steps. Its steps fill the form's steps field
  and are stored like any other. The pasted text is kept with the recipe
  (`recipe.source_text`) and shown folded away on its page. Tried on one made-up web page
  with navigation and a story around the recipe: all nine ingredients right, about 0.2
  cents.

## Steps and the cooking view

- A recipe has its preparation steps, one entry per printed step in printed order
  (`recipe.prep_steps`, `src/domain/import/steps.ts`). Null means nobody has read them yet,
  an empty list that the photos show none. They are folded away on the recipe page
  ("Arbeitsschritte", a `<details>` below the ingredients, numbered), like the photo: the
  household keeps cooking from the book on the shelf and did not want the app to replace
  it. On an iPad they stand open beside the ingredients (`.steps-beside`, shown through
  `::details-content`, so a tap on the heading changes nothing to see). "Kochen" next to
  "Einplanen" opens the view for cooking (`CookView`, a `<dialog>` over the whole screen;
  `#kochen` opens it too): the ingredients to tick off as they are set out, the steps in
  large writing, the one being cooked marked, "Zurück" and "Weiter" large at the foot
  (`stepAfter`), and the screen stays on (`useWakeLock`, shared with the view for the
  shop). Nothing of it is stored. The steps matter most for recipes that came in as text. A
  recipe without any says "Keine Arbeitsschritte vorhanden". A part the model could not read
  is "[…]", never a guess. Steps are typed and corrected one per line, on the review screen,
  on `/rezepte/[id]/bearbeiten` and in the form for a typed or pasted recipe
  (`readTypedSteps`); nothing typed there keeps them unknown. On the recipe's page they are
  changed in place ("Arbeitsschritte ändern", or "Eintragen" next to "Keine Arbeitsschritte
  vorhanden"; `?schritte=bearbeiten`, saved by `saveSteps` and shown open with
  `?schritte=offen`), and there an emptied field means none (`savedSteps`), so they are not
  read from the photo again. The old column `recipe.steps` was never written and is not read.
- Recipes imported before steps were read get them from their stored page photos with
  `npm run import:fill-steps`, one cookbook at a time: a reading of the steps alone
  (`STEPS_PROMPT`, `createAnthropicStepsReader`) and a check of them
  (`STEPS_VERIFICATION_PROMPT`), the cut-out of a recipe sent with its page. Ingredients are
  not touched. Such a recipe is approved already, so a doubt does not send it to review: the
  steps are stored with their doubts in German (`prep_steps_doubts`, `settleSteps`). The
  recipe page shows them above the steps, and "Arbeitsschritte prüfen" (a third tile under
  "Prüfen", `/import/pruefen/schritte`) lists such recipes with photo and steps side by
  side: "Stimmt so, übernehmen" stores the steps as they stand in the field and clears the
  doubts, "Keine Arbeitsschritte" stores none for a page whose steps are not on the photo.
  Saving the recipe's form does too. Steps a person saved are never overwritten. Without
  --write the script only counts and estimates.
- The recipe page shows the photographed page folded away (`<details>`): what is cooked from
  are the ingredients above it. Opened, it shows the recipe's own part of the page where it
  shares the page with others, with a link to the whole page below.

## Tags

- Beyond its category a recipe is described by tags in groups (`src/domain/library/tags.ts`):
  "Aufwand" (Schnell, Alltagsküche, Braucht Zeit), "Gericht" (pasta, rice, potatoes,
  casserole, pizza, pan, oven, burger), "Hauptzutat" (Hackfleisch, Hähnchen & Pute, Rind &
  Kalb, Schwein, Lachs & Forelle, Garnelen & Meeresfrüchte, Hülsenfrüchte, Tofu & Tempeh,
  Pilze, Eier, Käse; "Hülsenfrüchte" was a tag of "Ernährung" before), "Küche", "Saison",
  "Anlass", and "Eigene" for tags the household makes itself. The app refers to a tag by its
  key, or by its id when it has none. "Aufwand" and "Küche" hold one tag per recipe.
- The tags are suggestions and the household's to change: "Stichworte ändern" on a recipe's
  page and in a row of "Alle Rezepte" switches them on and off and takes new ones ("Omas
  Rezept"), as does the recipe's form. One form for both (`TagEditor`): every tag a chip, a
  group that allows one tag a choice of one with "Keins". Typing a new one offers the tags
  there are first (`suggestTags`), and a name that is one of them however it is written, or
  a letter or two away from one ("Oma Rezept" for "Omas Rezept"), is that tag (`similarTag`,
  also on the server in `saveRecipeTags` and `tagForName`): the household should not end up
  with two of almost the same name. Short names must be the same. `tagRecipes` suggests them
  with the reading model from title, category, printed time and ingredients, fifteen recipes
  per request, for recipes that do not say yet how much work they are: at the end of a
  batch, after a recipe was pasted as text, and for a whole library with
  `npm run import:tag-recipes`. A printed time is a fact the suggestion cannot overrule
  downwards (`settleEffort`): more than an hour is never quick. The batch page asks with
  three requests side by side, so two can describe the same recipe at once and each leave an
  effort or a cuisine; what is one too many is removed again (`surplusTags`: of two efforts
  the longer one stays). The paid upload test found a recipe that was both "Mediterran" and
  "Italienisch".
- The tags of "Hauptzutat" are read from a recipe's ingredients and title without a model
  (`mainIngredients`, `src/domain/library/main-ingredient.ts`): mince, chicken, salmon or
  lentils wherever they are in it, not a broth, a fat or a lookalike ("Hühnerbrühe",
  "Seelachs", "Ochsenherztomaten", "Pilzgulasch" is no beef); eggs and cheese only from the
  title; sweet things never. Stored with `npm run library:main-ingredients`. A recipe that
  then has no tag but its effort is described by the model with `import:tag-recipes --more`,
  which keeps its effort. On the household's 1,148 recipes (25 October 2026, dry run): 472
  had no tag but their effort, 200 still none after the main ingredients.
- The tags themselves are looked after on `/rezepte/stichworte`, by group with the number of
  recipes behind each (`src/domain/library/tag-admin.ts`, `src/server/tags.ts`). Every tag
  can be renamed, a category too: the app goes by the key, so code that finds
  "hauptgericht" or "schnell" still does. A name another tag has is refused; those two are
  merged instead. Only a tag the household made (no key) can be merged into another,
  deleted, or moved into Gericht, Küche, Saison, Anlass or Eigene; the app's tags stay, or
  the week would lose what tells it a recipe is quick. A merge or a move that would give a
  recipe two tags of "Küche" (or of "Aufwand") is refused with the number of such recipes.
  A merge links first and deletes after, so a failure halfway loses no recipe's tag. A
  refused change goes back with what was asked in the address, and the page asks the rule
  again to say why.

## Effort and time

- A recipe's effort is its tag, or without one its printed time: up to 30 minutes quick, up
  to 60 everyday, more takes time (`effortOf`). With neither it is not known.
- A recipe without a printed time is never "quick".
- A card shows the printed minutes, and where the cookbook prints none the effort instead
  (`timeText`). Of the household's 880 recipes all have an effort and 452 a printed time
  (October 2026). Nobody has to fill in times after cooking; the effort is changed under
  "Ändern" where it is wrong.
- Described with `claude-haiku-5-5` (October 2026): 880 recipes for about 9 cents; 474
  quick, 290 everyday, 115 that take time. 45 of them were looked at by eye and read
  sensibly; nothing was measured against a list made by hand.

## Search

- The search is meant to find, not to be exact (`searchRecipes`). Words are compared without
  umlauts. A word fits a recipe as a word of its title, the start of one, a part of one
  ("nudel" in "Pestonudeln"), an ingredient (catalog name, other names, or the printed line
  of an ingredient the catalog does not know), or a word of its category, diet or cookbook.
  The closer the fit, the higher the recipe. A word that fits nothing in the whole library
  may be one typing mistake away (two from nine letters on); short words must be right, or
  "Reis" would find "Eis". Recipes that fit only some words are listed as "Ähnliche
  Rezepte".

## Filters

- The filter is part of the address (`q`, `kategorie`, `kost`, `zeit`, `buch`, `ausgabe`,
  `favoriten`, `tag` with one or more tags separated by commas; several tags mean all of
  them; `saison=1`, `lange=1`). `ausgabe` counts only with its `buch`.
- Every list of recipes has the same filters (`FilterPanel` and `FilterBar` in
  `src/components/recipe-filters.tsx`, the groups from `facets`, the search and narrowing
  from `listRecipes` in `src/server/recipe-list.ts`): Entdecken, Favoriten, "Alle Rezepte"
  (with "Was fehlt" as a group of its own) and the chooser of a meal. From an iPad's width
  on the panel stands beside the list (`.filter-aside`), on a phone it is a sheet from the
  foot opened by "Filter" next to the search field, and in the chooser, whose side holds the
  week, a sheet at every size (from the right edge from `sm` on). The sheet has a height of
  its own (`86dvh`) and its list `flex: 1 1 auto`: on the iPhone, a sheet limited by a
  maximum alone showed its head and button with no filters between them. The sheet is the
  browser's own popover: it opens without a script and stays open while choices are tapped,
  "N Rezepte anzeigen" closes it. Every choice says how many recipes it would leave with the
  rest of the filter; one with none is pale and not a link. In a group of one (Zeit,
  Ernährung, Art, Aufwand, Küche, Kochbuch) another choice replaces the one that is on. What
  is on stands above the list as chips to take away, and an empty list offers each filter
  left out with its count ("Ohne „Salat“: 2 Rezepte"). The words searched narrow first, the
  choices count within what they found.
- "Passt zur Saison" and "Lange nicht gekocht" need what is not in a recipe's row: the pages
  that list recipes read the library with `loadLibraryForLists` (season and plan history
  side by side), and so does the index of the live search.

## Season

- The season calendar is data, `supabase/seed/seasons.ts` (`SeasonalFood`: the months a food
  is harvested in Germany, `fresh`, and those it comes from storage, `stored`, with the
  names it goes by), read through `src/domain/season/calendar.ts` and passed in, so that it
  can be changed and read again later (planning by offers). A catalog ingredient is a food
  by its names (`foodFor`: the name, a longer one ending in it, a compound word ending in
  it; the longest wins); one of whose names says tin, frozen or dried is none. Lemons,
  bananas and champignons are in no season. A recipe fits the season (`seasonFit`) by the
  foods it is made with that are harvested this month, weighted by how short their season is
  (up to four months 3, six 2, longer 1; herbs and what is stored all year 0.5; wild garlic
  3), plus 2 for the tag of the season; 2 points fit. Anything of a short season (five
  months at most) outside it, strawberries in November, keeps a recipe off. The card says
  why ("Mit Kürbis, Lauch"). Only lines of ingredients the calendar knows are read
  (`loadSeasonalFoods`).
- "Was hat gerade Saison?" (`/rezepte/saison`, linked from the top of Entdecken) lists what
  arrives this month, what is ripe, what leaves and what comes from storage, each food with
  its year as twelve small months (`.season-bar`) and its recipes, those the library uses
  most first; a tap shows them. Any month is a tap away.

## Sources and magazines

- A magazine is one source with its editions in it, a stack: `recipe.source_book`
  "Einfach Hausgemacht", `recipe.source_edition` "06/2020" or "Jahresheft 2021" (null for a
  cookbook; the same two on `import_batch`). The household types a source as one name, as
  on the cover, wherever it is asked ("Kochbuch oder Heft"); the server splits it
  (`splitSource`, `resolveSource`): a name that starts with a source there is, or with its
  initials ("EH 05/26"), is that source and the rest its edition; otherwise an edition at
  its end ("06/2020", "Jahresheft 2021", "Heft 3") makes a new stack. An issue is written
  as month and year in full ("05/26" is "05/2026"), so two spellings are one edition. A
  batch's folder is the edition of the stack typed above it, or of the one its name starts
  with (`editionFromFolder`); a cookbook's folder stays the cookbook. The upload form says
  before it starts where the photos go and whether stack and edition are new (`placement`).
  Everywhere a source is shown it is one name again (`sourceLabel`). The library lists the
  stack once ("Stöbern", the book chips) and offers its editions as chips once it is
  chosen. Sources stored before editions existed were split once, by the shape of the name
  alone.

## Entdecken

- Without a filter Entdecken has the whole width, the filters a sheet behind "Filter", and is
  made for the iPad, where the family browses (October 2026). One row of tabs: "Für euch" and
  every category with at least four recipes nobody marked (`categoryTabs`), each a page of
  its own inside its category. On each, the recipe of the day as one band (`recipeOfTheDay`:
  a meal that fits the season where there is one, its tags, "Einplanen"), then shelves that
  change with the day (`discover`): "Passt zur Saison" (wider cards), "Schnell" and "Noch
  nie gekocht" as rows three to a column (`look: "list"`), "Wie eure Favoriten" (meals
  sharing enough with a favourite: main ingredient 2, dish 1, cuisine 1, the same kind of
  meal 1, at least 3, `LIKE_WEIGHT`; one shared cuisine made 211 of 278 recipes "like a
  favourite"), "Lange nicht gekocht", three of the tags used most, a cookbook of the day,
  "Neu im Kochbuch". "Für euch" also has a row of four (the season, the stack, the fridge,
  the roulette) and "Worauf habt ihr Lust?", six themes that put filters together
  (`themes`: "Feierabendküche" is main dishes of 30 minutes; "Suppenzeit" from October to
  March, "Weihnachtsbäckerei" in November and December). A category's tab has chips by main
  ingredient and cuisine instead. Every shelf and row brings up what nobody has marked yet
  (`isMarked`): favourites and wishes are on "Favoriten" and on no shelf; a shelf shows ten
  in an order that changes by the day, and "Alle anzeigen" turns on its filter, inside the
  tab's category. Marked recipes are on no list a filter makes (`toDiscover`); only words
  typed into the search find them. There is no directory of every filter as tiles any more:
  it repeated the panel, and its names were cut off (October 2026). A library of up to
  thirty recipes is also shown whole.

## Regal

- The Regal (`/rezepte/regal`) is the family's cookbooks and magazines as spines on a shelf
  (`bookshelf`), each as tall as it has recipes, its name along it and a bar for how much of
  it was cooked (on a plan before today). The book of the day lies open below unless one is
  tapped (`?buch=`): its editions as chips, then what of it fits the season, what was never
  cooked from it (by page) and what was, with the day it was last cooked (`openBook`).

## Recipe stack

- The recipe stack (`/rezepte/stapel`) deals recipes no plan ever held and nobody marked,
  forty at a time in an order that changes by the day (`stackOf`), all meals or one
  category. Each card shows what is in it, pantry staples left out. A swipe to the right
  keeps it as a wish (`wanted_at`), to the left puts it aside for four weeks
  (`recipe.skipped_at`, `SKIP_DAYS`), upwards plans it. The card follows the finger from
  where it was taken, gives less and less downwards, and the swipe decides by where it would
  come to rest (Apple's projection), not where the finger let go; a tap opens the recipe.
  The three are round buttons as well and the arrow keys; "Zurück" takes the last back, and
  the card returns the way it left. Asked for less motion, cards only fade.

## Was ist noch da?

- "Was ist noch da?" (`/rezepte/zutaten`) matches in the browser (`fridgeMatches`,
  `loadFridge`): tap the foods recipes use most, or find any by typing, and the recipes that
  use most of them come first, each with what it still lacks. Pantry staples are neither
  offered nor missing. Favourites are among the results.

## Roulette

- The roulette (`/rezepte/roulette`) stops three reels, main ingredient, cuisine and effort,
  one after another on a combination with meals behind it (`combinations`, `spin`), and
  lists the meals. A tap holds a reel. Without main-ingredient and cuisine tags it says so.

## Recipe card and recipe page

- A recipe card has a heart in its corner (`FavoriteHeart`): a tap makes the recipe a
  favourite or takes the mark away, without opening it. The heart is a form next to the
  card's link, not inside it, and both lie in the card that lifts. A recipe made a favourite
  on "Entdecken" leaves its shelves.
- A recipe's page offers "Einplanen", "Möchte ich kochen" and "Kochen", in that order and in
  one row on a phone ("Vormerken" there), each as wide as its sign and words
  (`.recipe-actions`): three equal columns were too narrow, and the words ran past the
  pills. A sign in a narrow button keeps its size (`flex-shrink: 0`). Its tags are changed
  from a dashed pill as small as a tag (`.tag-edit`, "Ändern"), not a button of its own row.
  The favourite is the same heart as on a card, next to its title, and a pen next to
  "Zutaten" opens the form to change it ("Rezept ändern"). Under its facts it says when it
  was last cooked (`lastCooked`: the latest meal before today it was on, from the whole plan
  history), or "Noch nie gekocht". Its ingredients stand in the order the cookbook prints
  them: `recipe_ingredient.position`, written in reading order by every way a recipe is
  saved. A recipe on the plan of the week the household is in (`currentWeeks`: the running
  week, from Thursday on also the coming one), as a meal or as an extra, says "Eingeplant"
  instead, grey with green writing, and leads to where it stands (`plannedAt`).

## Favoriten

- "Favoriten" has a page of its own: on top what someone wants to cook, then the favourites
  sorted by category (`byCategory`). Its search and filters look through favourites only.

## Alle Rezepte

- "Alle Rezepte" (`/import/rezepte`) is the library as a table, the place to look after
  recipes: title, cookbook, page, category, kind, effort and time, servings, tags, heart,
  wish and when it was last cooked (`loadLastCookedAll`, the whole plan history). Its filter
  is the one of "Entdecken"; it also narrows to what lacks a category, an effort or any tag
  other than the effort (`?ohne=`). A column's heading sorts by it, again for the other way
  round (`?sortierung=`, `&richtung=ab`); a recipe without a value stands last either way.
  With words searched and no column chosen, the best fit comes first. Fifty recipes a page
  (`?seite=`, `pageOf`). All of it is in `src/domain/library/recipe-table.ts`. Columns give
  way with the width: a phone shows title, book, page, category and effort as one row whose
  line of facts opens the rest and the actions (a small arrow beside it; "Mehr" took a row
  under every recipe), and above the list one row each for the views with the tags as a
  sign, the count with "Alle wählen", and the four ways to sort without "Sortiert nach"; an
  iPad drops book, servings and tags into the title cell; a large screen shows every column.
- Ticked recipes (or "Alle auf dieser Seite") are changed together: a tag added (typed, as
  above) or taken away, a category or an effort set (`changeSeveral`). A tag added in a
  group that allows one replaces the one a recipe had there. Category and effort set this
  way count as checked by a person, like on "Angaben prüfen".
- A recipe is deleted from "Alle Rezepte" after asking (`deleteRecipe`). One that stands on
  any plan, past weeks and extras included, is not: the page lists where it stands, with
  links, and points to "Doppelte Rezepte" for a duplicate, whose merge takes its meals along.
  The recipe's own cut-out view goes from storage; its page photo stays with its batch,
  where other recipes may share it. Its import job is marked discarded, as after a merge.

## Looking after the library: Prüfen and duplicates

- Beside the review of new imports, "Prüfen" on the import page checks the whole library.
  Its two tiles stand at once and say "Wird gezählt …" until the library is read and
  checked (`CheckTilesWithLibrary` in a `Suspense`); the upload never waits for them.
  No confidence of the model is stored, so the fields it assigned are compared with the rest
  of the recipe (`checkRecipe` in `src/domain/library/quality.ts`): a kind that the
  ingredients contradict (fish without fish, vegetarian with bacon; a stock only hints), a
  category the title or ingredients contradict (a soup as a main dish, a cake with bacon), a
  quick effort with a long printed time or a time that cannot be right, more than twelve
  persons, a cake counted in persons. Each finding has a weight; the least trustworthy
  recipes come first. A finding is taken as suggested, set by hand or confirmed ("Stimmt
  so"), one by one or for several ticked recipes at once. A field a person set or confirmed
  is stored in `recipe.checked_fields` and not checked again. A finding about servings offers
  one tin or tray of the units the library uses most and of what baking usually makes
  (`servingsChoices`). Meat and fish are told by word lists; a word found inside another
  misleads ("mett" in "Limette" made lime juice meat), so such a word is anchored to the
  start of a word. A recipe opened from either page leads back there (`?von=angaben`,
  `?von=doppelt`).
- Duplicates (`findDuplicates`, `src/domain/library/duplicates.ts`) need a similar title and
  shared ingredients, pantry staples left out. The same book and page is no reason: one
  page often holds several recipes, and "Tunfisch und Zwiebeln" and "Zwiebeln und Cheddar"
  of page 111 were offered as one. A title that names an ingredient only its own recipe has
  ("mit Garnelen", "mit Kichererbsen") makes a variant, unless almost all ingredients are
  the same. "Dieses behalten" is marked only where something speaks for it (planned more
  often, a favourite, `keepReason`). A pair is shown side by side: "Dieses behalten" asks once more, then
  `merge_recipes` (one transaction, the caller's rights) moves meals and extras to the kept
  recipe, carries over favourite, wish, the household's own tags and a missing category,
  marks the duplicate's import job as discarded and deletes the duplicate. "Beide behalten"
  is stored in `recipe_pair_kept`.
