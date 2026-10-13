# Essensplan

Family meal planner and grocery list for one household of four, used mostly on phones and
tablets. It replaces a handwritten weekly meal plan and the shopping list written from it.
Success means: planning a week and getting a correct, printable list takes a few minutes and
is easier than pen and paper.

@AGENTS.md

## Language

- UI text is German. Code, comments, commit messages and docs are English.
- German words stay German where they are data: ingredient names, units (EL, TL, Stück, Bund),
  shop names, aisle groups.

## Commands

| Task                                                                      | Command                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| Dev server                                                                | `npm run dev`                                  |
| Unit tests (domain, schema, acceptance)                                   | `npm test`                                     |
| One test file                                                             | `npx vitest run src/domain/units.test.ts`      |
| Typecheck                                                                 | `npm run typecheck`                            |
| Lint                                                                      | `npm run lint`                                 |
| Format                                                                    | `npm run format`                               |
| Print the sample week list and compare with the handwritten one           | `npm run sample-week`                          |
| Regenerate `supabase/seed.sql` from `supabase/seed/*.ts`                  | `npm run seed:build`                           |
| Check the Supabase project in `.env.local`                                | `npm run db:check`                             |
| Measure a model on the five sample recipe photos (calls the API)          | `npm run import:eval`                          |
| Measure the second check pass with planted mistakes (calls the API)       | `npm run import:eval-verify`                   |
| Run the complete import on photos without touching the database           | `npm run import:photo -- <photo> --book "..."` |
| The same for the five sample recipes                                      | `npm run import:photo -- --samples`            |
| Browser tests against the separate test household (free)                  | `npm run e2e`                                  |
| The same while `npm run dev` is already running                           | `E2E_PORT=3000 npm run e2e`                    |
| Create or remove that test household and its login                        | `npm run e2e:setup`, `npm run e2e:teardown`    |
| Browser test of a real upload with the models (about 2 ct)                | `npm run e2e:upload`                           |
| Screenshots of every screen, phone and desktop, into `test-results/look/` | `npm run e2e:look`                             |
| A whole batch import from the command line, as the test user              | `npm run e2e:batch -- <photos>`                |
| Give already imported recipes the servings unit their photo prints        | `npm run import:servings-units -- "<name>"`    |
| Turn stored page photos upright and cut out each recipe (calls the API)   | `npm run import:frame-photos -- "<name>"`      |
| Measure whether pages laid on any side come back upright (calls the API)  | `npm run import:eval-frame`                    |
| Describe recipes with tags: effort, dish, cuisine, season (calls the API) | `npm run import:tag-recipes -- "<name>"`       |
| Regenerate the database types after a migration                           | `npm run db:types`                             |
| Apply new migrations to the linked Supabase project                       | `npx supabase db push`                         |

Docker is not required for tests. Migrations, seed and RLS run against an embedded Postgres
(PGlite) in `supabase/tests/`.

## Workflow

- Work in phases: 0 scaffold, 1 schema and domain logic, 2 recipe import, 3 auth and UI,
  4 recurring items, leftovers, at-home step, history, 5 recommendations, 6 deployment, PWA,
  export. One branch per phase, named `phase-N-topic`, stacked on the previous one. Small
  commits, one concern each.
- Phase 3 is split, each part with its own pull request: 3a login, batch import, review and
  new ingredients (done); 3b week planner with suggestions and the library to browse (done),
  then the goals of a week, coffee on Sundays, extras, foods for a cold supper, recipes
  typed in by hand and a search that forgives (done); 3c shopping list, print and PDF (done). The suggestions were planned as phase 5 and came forward:
  the household wants planning to start from them.
- After the household's first week with the app (branch `phase-4-suggestions-favourites-history`):
  suggestions only when asked, wishes, tags that describe a recipe, a page for favourites, a
  search that answers while typing, recipes pasted as text, all weeks at a glance,
  pictograms and a logo (done).
- Merging into `main` deploys migrations to the Supabase project (GitHub integration). A
  migration that is needed to test a branch is applied earlier with `npx supabase db push`;
  the merge then finds it already applied. Keep such migrations additive.
- Run the browser tests through `npm run e2e`, never through `npx playwright test`: only
  the script leaves out the paid upload test. A file is named with its path
  (`npm run e2e -- e2e/list.spec.ts`); a bare word such as "plan" matches the name of the
  project folder and with it every test.
- There is no local Supabase (Docker does not start on this machine). Development and browser
  tests run against the hosted project, in a separate test household that row level security
  keeps apart from the real one. Never write test data into the real household.
- After each phase: stop, summarize, and say how to test it manually.
- Never commit secrets or anything from `samples/`. That folder holds private photos with GPS
  data and stays gitignored.
- No feature is done without tests for its domain logic.

## Stack and decisions

- Next.js 16 (App Router, TypeScript), Tailwind 4, installable as a PWA.
- Supabase in Frankfurt: Postgres, Auth, private Storage bucket, RLS on every table.
- Supabase no longer grants table privileges automatically. Every migration that creates a
  table must grant to `authenticated` and `service_role` explicitly and revoke from `anon`.
- Keys are the new Supabase ones: the publishable key for the browser, the secret key for the
  server only.
- Hosting on Vercel. Login with email and password, accounts by invite only, sign-up disabled.
- The shopping list must work offline in the shop: cached list, queued check-offs.
- Vitest for unit tests, Playwright for a few end-to-end flows.
- Recipe import uses the Anthropic API, server side only. Model IDs come from
  `ANTHROPIC_EXTRACT_MODEL` and `ANTHROPIC_VERIFY_MODEL`. Never hard-code a model ID.
- Budget: at most 2 cents per recipe for both passes. Start with `claude-haiku-5-5`. A recipe
  the cheap model cannot read with certainty goes to the review queue. It is never handed to
  a pricier model automatically.
- Every model call goes through the `RecipeReader` type in `src/server/import/read-recipe.ts`.
  Another model or provider gets its own reader; nothing else in the import changes.
- Which model is good enough is decided by `npm run import:eval`, on the household's own
  sample recipes, not by assumption.
- Recipes are added on an upload tab in the app. The model detects title and kind. The
  household enters what a photo cannot show: cookbook and, if not printed, the page. The
  cookbook is asked once per batch and pre-filled from the folder name when a folder is chosen.
- Photo uploads go from the browser straight to Storage. The server turns each one into an
  upright JPEG without metadata (the photos carry GPS). sharp cannot decode iPhone HEIC, so
  those go through `heic-decode` first. See `src/server/import/normalize-image.ts`.
- A 24 megapixel page loses more than half its resolution at the model's size limit. The
  import can send enlarged full-resolution parts along with the page (`prepareForModel`).

## Architecture

- `src/domain/`: pure TypeScript. No imports from Next.js, React, Supabase, the Anthropic SDK
  or Node built-ins. ESLint enforces this. Tests sit next to the code as `*.test.ts`.
- `src/server/`: everything that talks to the database, storage or a model. `src/app/`:
  routes and UI. `src/lib/`: small helpers shared by server and browser code.
- `src/domain/library/`: the recipe library as data (`RecipeSummary`), its filter and the
  shelves of the browse page. `src/domain/recommend/`: the balance of a week and the
  suggestions. `src/server/library.ts` and `src/server/planning/week.ts` load and store what
  they work on.
- Pages: `/woche` (the week plan, start page; `?t=extra` shows what the week needs outside
  its meals, `?frage=<date>.<meal>` the meal a suggestion was asked for), `/woche/auswahl`
  (choosing a recipe for a meal or for the extras), `/woche/lebensmittel` (what to buy for a
  meal without a recipe), `/woche/ziele` (the goals of a week), `/woche/verlauf` (all weeks,
  month by month), `/rezepte` (browse and search, called "Entdecken"), `/favoriten`,
  `/rezepte/[id]`, `/rezepte/neu` (a recipe typed in, or with `?art=text` pasted as text) and
  `/rezepte/[id]/bearbeiten` (a recipe corrected by hand), `/einkauf` (the shopping list of a
  week) with `/einkauf/pdf` (the same as a PDF), `/import`.
- `/api/suche` hands the signed-in browser the library as a search index
  (`SearchIndex`: recipes, and per recipe which catalog ingredients it uses). The search
  field (`LiveSearch`) fetches it once per visit and searches it with the same pure
  `searchRecipes` the server uses, so a list unfolds with the first letter and changes with
  every further one. Sending the search still goes to the server and works without scripts.
- The week plan and the filters are plain forms and links: a server action per button, the
  filter in the address. They work before any script has loaded and need no client state.
- The API returns at most 1000 rows per request and cuts a longer answer off without saying
  so. Anything that can grow beyond that is read with `allRows` (`src/server/catalog.ts`):
  recipes, recipe tags, ingredient lines, import jobs, and the catalog itself. The catalog
  was read in one request until it had 1024 ingredients; Zucker and Zwiebeln then did not
  exist for the app. `tests/paging.test.ts` scans the source for reads of growing tables that
  are neither narrowed nor paged.
- `src/proxy.ts` (the Next.js 16 name for middleware) keeps the session fresh and sends anyone
  without one to `/login`. Pages get the household through `requireHousehold()`.
- Two Supabase clients on the server: `createSessionClient()` acts as the signed-in user and
  is bound by row level security; use it for all table access. `createAdminClient()` bypasses
  it and exists only for storage. Never use it for a table without checking access first.
- Cache Components are switched off (`next.config.ts`): every page is private and read per
  request. Read `node_modules/next/dist/docs/` before using a Next.js API; version 16 differs
  from older ones (`proxy.ts`, async `params`, `PageProps<"/route">`).
- UI text is written in German directly in the components. There is no strings file.
- Server actions of one browser tab run one after the other. Work that should run side by side
  (the import steps) goes through a route handler instead: `src/app/api/import/`.
- `e2e/`: Playwright tests. `e2e/fixtures.ts` puts the test household into a known state
  without calling a model.
- `supabase/migrations/`: schema. `supabase/seed/*.ts` is the single source for the catalog
  and seed recipes; `supabase/seed.sql` is generated from it.
- `supabase/tests/`: applies migrations and seed to an embedded Postgres and tests schema
  constraints and RLS. A new table must have `household_id`, RLS and a policy, or these fail.
- `tests/fixtures/sample-week/`: the handwritten plan, list and recipes, transcribed, plus
  `inputs.json` with what else the list depends on (free entries, at-home ticks, what is
  bought later, which recipes are still pending).
- `tests/acceptance/`: builds the list for that week with the real catalog and compares it
  with the handwritten one. `npm run sample-week` prints both.

## Design

- Calm and structured: warm paper, dark ink, one green accent, generous spacing, no pictures
  needed. One sans-serif family for everything. No serif typeface: the household does not
  want the look of an AI product.
- Words on the screen say something concrete or are left out. No filler such as "for
  variety" or "just for you"; a suggestion without a reason shows none.
- The shared classes (`.btn`, `.field`, `.card`, `.chip`, `.title`, `.eyebrow`) are in the
  `components` layer of `src/app/globals.css`, so a utility class on the same element wins.
- One layout for all sizes: a single column on a phone, more columns from `sm` on. The week
  plan puts lunch and dinner side by side from tablet width. An iPad and an iPhone version
  with their own layouts are planned for later, so nothing may depend on hover or a mouse.
- A recipe has a pictogram (`pictogramFor`: pasta, soup, fish, cake, 21 in all, drawn as
  lines in `pictogram-paths.ts`). It stands large, pale and slightly out of focus behind a
  card's text (`.watermark`) and small on its pastel in front of a name (`.badge`). The kind
  of dish decides before what is in it: a salmon pasta is pasta. Never a photo.
- The logo is a plate with its cutlery on the app's green, and "Essensplan" with the plan in
  green (`logo.tsx`, `app/icon.svg`). On a phone the five sections are a bar at the bottom
  with a sign above each name.
- What moves, moves a little: a card lifts under the finger (`.lift`), a page comes in
  softly, and both are off for whoever asked for less motion. Nothing depends on it.
- Every kind of meal has a pastel of its own (vegetarian, fish, poultry, meat: `--color-veg`
  and so on). Cakes and desserts have one too (`kind-sweet`), so a cake is not shown as a
  vegetarian meal. A parent with the class `kind-<group>` sets it; `.tag` and `.dot` inside use it.
  The same colour marks the kind on a recipe card, next to a planned meal, in the week's
  count and in the goals. Keep the palette pastel: the household asked for that.
- Tailwind runs as a PostCSS plugin (`postcss.config.mjs`), as the Next.js guide sets it up.
  The Turbopack loader `@tailwindcss/turbopack` used before never picked up a change to
  `globals.css` in a running dev server: the household saw a day's worth of new pages
  without their styles. After a change of the look, check it in the running app itself
  (fetch the stylesheet or take a screenshot); passing tests do not show a missing style.

## Acceptance test

The generated list is accepted when, per shop, it has the same lines as the handwritten one,
with the same quantity where the paper shows one and none where it shows none, the same note,
and an aisle order the handwritten order does not contradict.

Lines that come from a recipe the household has not added yet are listed under `pendingLines`
in `inputs.json`. When such a recipe is added to `supabase/seed/recipes.ts`, give the plan slot
its `sampleRecipe`, remove the lines from `pendingLines`, and the test must still pass.

## Domain rules

Household

- Default servings: 4. The main shopping day is Monday, the first day of the planned week.

Units and conversion

- Base units are g and ml. EL = 15 ml, TL = 5 ml.
- Mass and volume convert only through an ingredient's own density. Counted units (Stück,
  Bund, Zehe, Dose, ...) convert only through the ingredient's own grams-per-unit values.
- If two amounts of one ingredient cannot be converted, keep separate lines. Never guess.
- The exception is a spoonful or a pinch (EL, TL, Prise, Msp) that cannot be converted: it
  counts as "some" on the ingredient's line. Otherwise three tablespoons of butter would be
  the line "55 ml Butter".

Recipes

- Scale by slot servings / base servings. Base servings can be a range such as 4 to 6. If the
  slot servings fall inside the range, the recipe is cooked as written.
- Base servings count persons unless the recipe has a servings unit. Baking and finger food
  count what they make: 1 "Springform (Ø 26 cm)", 1 "Backblech", 40 "Stück". The unit is free
  text as printed, null for persons (`recipe.servings_unit`, `Servings.unit`).
- A recipe for persons is planned for the household's servings. A recipe with a unit is
  planned as written (`plannedServings`): scaled to four persons, a recipe for one cake tin
  would bake four cakes. Someone who wants two trays sets the slot to 2.
- A quantity range ("2-3") counts with its upper bound for shopping.
- An alternative ingredient ("oder Petersilie") never reaches the list.
- A recipe has at most one category: Hauptgericht, Suppe & Eintopf, Salat, Beilage, Vesper,
  Snack & Fingerfood, Dessert & Süßspeise, Kuchen & Gebäck, Frühstück, Getränk, or Soße, Dip &
  Grundrezept. A category is a tag of the group "Kategorie" with a stable `key`. The import's
  `dishType` is that key. Find such tags by key, never by name: the household may rename them.
  A new category needs a migration that adds its tag to every household, an entry in
  `DISH_TYPES` and a line in the reading instructions.
- The household may rename a recipe and edit its ingredients. The printed text is kept in
  `original_text` and `source_title`.

Week plan

- A week runs from Monday to Sunday and has two meals a day. A meal is one or more recipes
  (a main dish and its side), or something without a recipe: free text such as "Vesper",
  leftovers, away, or skipped. A meal that is not planned has no row.
- The planner opens on the running week, and from Saturday on the coming one: the household
  plans on the weekend.
- A week is counted by the heaviest protein of each cooked meal: red meat, poultry, fish,
  vegetarian (vegan counts as vegetarian). Only recipes that are a meal by themselves count
  (main dish, soup, salad, cold supper, or no category), so a cake is no vegetarian dinner.
- What the household aims for per week (`DEFAULT_TARGETS`): at least 3 vegetarian meals and
  1 fish meal, at most 2 with poultry and 2 with red meat. The household sets its own on
  `/woche/ziele` (`household.balance_targets`, read with `readTargets`). Every device is shown
  that page once before the plan, remembered in the cookie `ziele-gesehen`: each person
  should see the goals and be able to change them, but they belong to the household.
- Sunday has a third meal, "Kaffee & Kuchen" (`meal` value `coffee`, `mealsOf`). It is
  optional: nothing is suggested on the plan, and choosing for it suggests cakes and desserts.
  Cakes and desserts are never suggested for lunch or dinner.
- "Außerdem" holds recipes a week needs outside its meals (`plan_extra`): two cakes for an
  invitation. They count for the shopping list, not for the balance.
- A meal without a recipe can carry foods to buy (`plan_slot_food`): bread, cold cuts and a
  cucumber for a "Vesper". A food is a name, not an amount. It may name where it is bought
  for that meal (`VESPER_FOODS`: bread from the Bäcker, cold cuts from the Metzger), whatever
  the catalog says for cooking. Foods are copied with the meal to the next week.
- A typed meal whose text is the title of a recipe is planned as that recipe. Any other typed
  meal stays text and offers "Rezept anlegen", which opens the recipe form with the title
  filled in and puts the saved recipe on that meal.
- A suggestion has points and reasons (`scoreRecipe`): +8 when someone wants to cook it, +3
  when its group is still below the least the week should have, -4 when its group is used
  up, +2 for a favourite, -3 when it was on a plan in the last 4 weeks, +1 when it was last
  cooked 8 weeks ago or longer. Equal recipes are ordered by a seed (week, meal), so the
  order is stable between two looks.
- The plan does not fill itself. An open meal has "Planen" and "Hast du einen Vorschlag?".
  Asked, the meal shows one suggestion with its reasons, "Gute Idee!" to take it and "Noch
  ein Vorschlag" for the next best; after twelve they come round again. The household found
  a plan that arrives full of suggestions too pushy.
- Up to three open meals show an idea faintly, without being asked: the suggestions with
  the most to say for them (a wish, a favourite, a gap in the week), spread over the week.
  Tapping one asks about that meal.
- "Plan vervollständigen" plans every open meal that is still to come at once. Those
  suggestions are chosen one after the other as if the earlier ones were accepted
  (`suggestWeek`), so that the completed week meets the targets. Nothing is suggested twice
  in a week.
- Suggested are main dishes and soups, in the evening also salads and cold suppers: lunch is
  the cooked meal in this household. Anything can still be planned by hand for any meal.
- From Monday to Friday nobody cooks for hours (`suitsDay`): lunch is suggested from what
  is quick or fits a normal day, the evening only from what is quick or cold. A recipe whose
  effort is not known is kept for the weekend. The household had many warm main dishes
  suggested for workday evenings that it could never cook then.
- "Möchte ich kochen" marks a recipe someone wants to cook soon (`recipe.wanted_at`). It is
  suggested before everything else, shown above the plan to be placed with one tap, and the
  mark goes as soon as the recipe is on a plan (`fulfilWishes`), as a meal or as an extra.
- "Alle Wochen" (`/woche/verlauf`) lists every week with a plan, month by month and newest
  first, with its calendar week, its meals day by day and its count per kind. A week counts
  for the month most of its days are in. The week being planned is always listed.
- A recipe for persons is planned for the household's servings, a recipe with a servings
  unit as written.
- "Letzte Woche übernehmen" copies last week's meals into the meals this week has not
  planned yet. Leftovers lose the link to the meal they came from.

Library

- The filter is part of the address (`q`, `kategorie`, `kost`, `zeit`, `buch`, `favoriten`,
  `tag` with one or more tags separated by commas; several tags mean all of them).
- Beyond its category a recipe is described by tags in groups (`src/domain/library/tags.ts`):
  "Aufwand" (Schnell, Alltagsküche, Braucht Zeit), "Gericht" (pasta, rice, potatoes,
  casserole, pizza, pan, oven, burger), "Küche", "Saison", "Anlass", and "Eigene" for tags
  the household makes itself. The app refers to a tag by its key, or by its id when it has
  none. "Aufwand" and "Küche" hold one tag per recipe.
- The tags are suggestions and the household's to change: "Ändern" on a recipe switches
  them on and off and takes new ones ("Omas Rezept"). `tagRecipes` suggests them with the
  reading model from title, category, printed time and ingredients, fifteen recipes per
  request, for recipes that do not say yet how much work they are: at the end of a batch,
  after a recipe was pasted as text, and for a whole library with
  `npm run import:tag-recipes`. A printed time is a fact the suggestion cannot overrule
  downwards (`settleEffort`): more than an hour is never quick. The batch page asks with
  three requests side by side, so two can describe the same recipe at once and each leave
  an effort or a cuisine; what is one too many is removed again (`surplusTags`: of two
  efforts the longer one stays). The paid upload test found a recipe that was both
  "Mediterran" and "Italienisch".
- A recipe's effort is its tag, or without one its printed time: up to 30 minutes quick, up
  to 60 everyday, more takes time (`effortOf`). With neither it is not known.
- Described with `claude-haiku-5-5` (October 2026): 880 recipes for about 9 cents; 474
  quick, 290 everyday, 115 that take time. 45 of them were looked at by eye and read
  sensibly; nothing was measured against a list made by hand.
- The search is meant to find, not to be exact (`searchRecipes`). Words are compared without
  umlauts. A word fits a recipe as a word of its title, the start of one, a part of one
  ("nudel" in "Pestonudeln"), an ingredient (catalog name, other names, or the printed line
  of an ingredient the catalog does not know), or a word of its category, diet or cookbook.
  The closer the fit, the higher the recipe. A word that fits nothing in the whole library
  may be one typing mistake away (two from nine letters on); short words must be right, or
  "Reis" would find "Eis". Recipes that fit only some words are listed as "Ähnliche Rezepte".
- A recipe typed in by hand (`readTypedRecipe`) has one ingredient per line, written as on a
  shopping note: "200 g Spaghetti", "2-3 Tomaten", "Parmesan". A number without a unit counts
  pieces, what follows a comma is a note. It is approved at once, and a quick meal unless a
  cookbook is named. Unknown ingredients become proposals, as in the import.
- Any recipe can be corrected on `/rezepte/[id]/bearbeiten`, its ingredient lines included.
  The lines are the rows of the import's review (`IngredientRows`, shared by both forms):
  amount, unit, ingredient and note per row, the printed line shown above it. What is typed
  is checked on the server by `readReview`, and saving replaces the recipe's lines.
- The recipe page shows the photographed page folded away (`<details>`): what is cooked from
  are the ingredients above it. Opened, it shows the recipe's own part of the page where it
  shares the page with others, with a link to the whole page below.
- A recipe without a printed time is never "quick".
- Without a filter the page shows a few shelves that change with the day (`discover`):
  what someone wants to cook, favourites, quick meals, what is tagged for the season, long
  not cooked, new. A shelf shows ten recipes, favourites first, the others in an order that
  changes by the day. Below them "Stöbern" is a directory (`directory`): every category,
  tag, diet and cookbook as a tile with the number of recipes behind it. A library of up to
  thirty recipes is also shown whole.
- "Favoriten" has a page of its own: on top what someone wants to cook, then the favourites
  sorted by category (`byCategory`). Its search and filters look through favourites only.
- A recipe can be pasted as text (`/rezepte/neu?art=text`): the reading model reads it by
  the rules for photos (`createAnthropicTextReader`), and what it read fills the form for a
  typed recipe (`pastedRecipe`), where a person checks it before anything is saved. What
  needs a look is listed above the form: no title, no servings, a line the model was unsure
  about, an alternative that was left out. The pasted text is kept with the recipe
  (`recipe.source_text`) and shown on its page, because the steps are nowhere else. Tried on
  one made-up web page with navigation and a story around the recipe: all nine ingredients
  right, about 0.2 cents.

Shopping list

- Lines are built per canonical ingredient: scale, convert to the ingredient's default unit,
  sum, then round for purchase.
- Buying mode decides what is shown: `none` shows the name only, `count` a number of pieces,
  `weight` a weight, `pack` a multiplier only when more than one pack is needed ("2x Garnelen").
- Line text follows the handwritten list: quantity, name, note ("600 g Leberkäse",
  "Milch WS 1.29"). The exact sum and the meals it comes from stay available per line.
- The household's word is shown, not the recipe's (Karotten for Möhren). Synonyms map to one
  catalog ingredient. One piece takes the singular when the catalog lists it among the other
  names: "1 Zitrone".
- Shop is a household setting per ingredient and can be overridden per line for one week.
  The list by shop (`presentList`: by shop, then by aisle group, a shop can override the
  aisle order) is what the acceptance test compares with the handwritten list.
- The household does not plan by supermarket for now. What it sees, prints and exports is
  the list by kind of grocery (`presentByAisle`): one walk through a shop, Obst & Gemüse to
  Sonstiges. A line shows its shop only where one was named on purpose (`shopByChoice`):
  "Brot · Bäcker" for a cold supper.
- Freshness: an ingredient with a shelf life shorter than the days between the shopping day
  and the meal goes to a "buy later" section with the day it is needed. Everything else is
  bought on the main shopping day.
- For an ingredient bought in packs, a typed "2x" or a bare "2" means two packs.
- "Haben wir schon?": pantry staples are pre-ticked as at home. A line the user added by hand
  is never pre-ticked.
- Free entries are first-class. "Milch WS 1.29" is matched to the catalog (Milch) and keeps
  the rest as a note. Text that matches nothing stays a free line.
- When the plan changes, lines are recomputed and matched by a stable line key
  (`<ingredient>@<trip>`). Notes, shop overrides, at-home marks and check-offs belong to the key
  and survive. A change is reported only when the quantity shown on the list changes.
- The list is worked out from the plan every time it is shown (`loadShoppingList`), so it
  cannot disagree with the plan. Stored are only what the household does by hand: typed
  entries (`shopping_manual_entry`) and, per line key, tick, note and "we have that"
  (`shopping_line_state`). The table `shopping_line` is not written yet.
- Besides the cooked meals the list holds the week's extras, scaled like a meal and bought on
  the main shopping day, and the foods of meals without a recipe, by name and without an
  amount. The exception is a food named as one piece of something bought by the piece:
  "Gurke" for the catalog's "Gurken" is "1 Gurke" and adds up with what recipes need
  (`namesOnePiece`). Named in the plural it stays a name. A food bought somewhere else than the catalog says is its own line
  (`<ingredient>@<trip>@<shop>`). What someone asked for by name is never assumed to be at home.
- The main shopping day is the household's weekday of the planned week (Monday).
- Export: the page has a print layout (black on white, two columns, a box per line, no
  controls), and `/einkauf/pdf` writes the same list with `pdf-lib`. Both show what is still
  to buy, without what is ticked off or at home.

Import

- The steps, in `src/server/import/import-recipe.ts`: normalise the photos, read them (first
  pass), map every line to the catalog, run the automatic checks, let a second request compare
  the transcription with the photos (second pass), then decide.
- The household only looks at recipes that were not read with certainty. A recipe goes to the
  review queue when something about the reading is doubtful: no title or servings, a line the
  model was unsure about, an amount without a unit or far too large, or the second pass
  seeing something different. A recipe the second pass could not check is never approved.
- What a recipe's amounts are for is decided by its printed servings line, which the model
  copies into `servingsRaw` (`src/domain/import/servings.ts`). A line that counts persons
  keeps the numbers the model read. A line that counts something else ("Zutaten für 1
  Springform (Ø 26 cm)", "ca. 20 Stück") gives the number and the unit. A line the app cannot
  interpret assumes nothing and sends the recipe to review. Measured on the first four
  cookbooks: 654 lines, 485 for persons, 46 for something else, none unclear, 123 recipes
  without a line.
- The check for amounts that are far too large counts a recipe with a unit as twelve
  portions, or 1.5 kg of fruit for one tray would look like a misreading.
- An ingredient the catalog does not know is not a reason for review, and neither is doubt
  about the category. The recipe was read correctly; only the catalog is behind. Measured on
  the first real cookbook: 100 of 118 recipes waited for nothing but unknown ingredients.
- Never guess. A value the model cannot read with certainty is null, and the model says so in
  `uncertain`. Observations that need no decision go to `notes` and never block approval.
- What a photo cannot show comes from the upload form: the cookbook always, title and page
  when they are not printed. The printed title stays in `source_title`; a title the household
  entered never overwrites it.
- Mapping to the catalog: the longest part of the printed line that contains the ingredient's
  name and is a catalog name wins ("1 getrocknete Chilischote" is not the fresh one).
- A line without an amount that names several ingredients the catalog knows one by one is
  split after reading (`splitJoinedLines`): "Salz und Pfeffer" is salt and pepper. The
  household had "Salz & Pfeffer" as an ingredient in 264 recipe lines before. Typed recipes
  are split the same way.
- An ingredient the catalog does not know is never created silently. It becomes one open
  proposal per product: either another name for an existing ingredient, or a new one with a
  suggested aisle group, shop, buying mode and shelf life. Until it is decided, its recipe
  lines stay as printed text.
- Singular, plural and a leading "Bio-" are the same product ("Lachsfilets", "Bio-Gurke").
  The import maps them by itself, and proposals the catalog can answer by now are closed
  before the list is shown. Short words get no such variants: "Ei" is not "Eis".
- The second pass never sees the printed lines of the transcription, only the values.
  Otherwise it would compare the transcription with itself instead of with the photo.
- A batch is one sitting with one cookbook: any number of page photos, in page order. Each
  request does one step and records it (`src/server/import/batch.ts`): look at a page, group
  pages into recipes, import a recipe. The batch page drives this with three requests side by
  side. A closed tab loses nothing; a step abandoned for five minutes is done again.
- Pages are grouped into recipes by `groupPages`: complete on one page, title and ingredients
  on facing pages in either order (page numbers decide which pages face each other), or
  running on to the next page. Pages without a recipe are left out and shown as such.
- A photo may show several recipes, such as a double page with four. Each becomes its own
  job that says which recipe is meant, by position in reading order and by title. Such a photo
  is read from the page plus enlarged parts at full size, because the print is too small
  otherwise. A clean full-size copy is kept for that and removed when the batch is through.
  Measured on a made-up double page with four sample recipes: read from the page alone, one
  fraction was misread; with enlarged parts all were correct, at about 0.95 cents per recipe.
- "Neue Zutaten" is one list. Every row has the suggested decision already set: a new
  ingredient with its aisle, another name for an existing one, not for the catalog, or later.
  The household changes what is wrong and confirms everything with one button. The
  suggestions "same as an existing ingredient" are listed first, because a wrong one there
  would quietly put the wrong product on shopping lists.
- What was read must always be storable. A recipe that waits for review can contain anything
  a model returned, so the stored rows are made valid (an amount without a known unit becomes
  a count, a broken range loses its upper bound) and the checks flag each case. If the
  database still refuses a recipe, the job is marked failed with the reason. It is never put
  back in the queue: a failure that repeats would stop the batch at the same recipe forever.
- Only an outage puts a step back in the queue. A rate limit of the model service is answered
  with "throttled"; the batch page waits and carries on by itself.
- A batch is finished only when every page that holds a recipe belongs to a recipe job and no
  job waits. While another request is still grouping the pages, the answer is "waiting".
- The first look notes the page number of each recipe's own side, so the two recipes of a
  double page get their own page numbers.
- "Handvoll" is a unit. A length ("2 cm Ingwer") is a size, stored as one piece with the
  size in the note.
- Titles printed all in lower case or capitals are stored with normal German capitalisation.
  A small container that is no unit of its own ("Döschen", "Briefchen") is a Packung.
- A batch can be deleted. Its pages, photos and the recipes read from it go; ingredients
  confirmed along the way stay.
- The photo bucket has no storage policies. Uploads and views go through signed URLs from the
  server. The upload from the phone is deleted as soon as the clean JPEG is stored.
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
- Measured with `claude-haiku-5-5` (October 2026), every photo laid on each of its four
  sides: 20 of 20 sample pages and 63 of 64 pages from the household's own folder came back
  upright, one was left as it was, none was turned wrongly, at about 0.1 cents per page.
  Asked about one photo alone it was 19 of 20 and 60 of 64, and one stored page ended up on
  its head. The library's 492 pages: 67 turned upright, 602 of the 629 recipes that share a
  page got a view of their own.
- Review (`/import/pruefen`) shows photo and fields side by side. Everything typed is checked
  again on the server by `readReview`. Approving replaces the recipe's lines.
- Model instructions live in `src/server/import/prompt.ts`. Their examples must not come from
  the sample recipes, or the measurements stop meaning anything.
- Measured on the five sample photos with `claude-haiku-5-5` (October 2026): 15 of 15 readings
  without a mistake over three runs, 25 of 25 planted mistakes caught by the second pass, no
  false alarm, about 0.35 cents per recipe for both passes. Re-measure after changing a prompt
  or a model.

## Open items

- Recipes still to come from the household: Tomate Mozzarella, Pestonudeln, Leberkässalat,
  Garnelen-Salat mit Feldsalat, Schafskäseauflauf, Hawaiitoast, Apfelkuchen, and homemade
  Spätzle as a side. "Reste" and "Vesper" never have a recipe.
- Three seed recipes have no cookbook name yet: the steak (a magazine page) and the two from
  the book with pages 82 and 84. The two from "Speed Cooking" have their title from the
  household, because the printed title was not photographed.
- The Anthropic API is billed separately from a Claude Pro subscription. The measurement
  scripts and the import itself need `ANTHROPIC_API_KEY` in `.env.local`.
- Grouping title and ingredient pages has only been tested with made-up page descriptions.
  The sample photos contain no recipe that spans two photos. Check it on the first real batch.
- Not built yet in the import: retrying a failed page or recipe from the screen.
- The tags of a batch are suggested at its end, while its page is open. A batch that was
  left earlier keeps recipes without tags; `npm run import:tag-recipes` catches up. A recipe
  typed in by hand gets no suggested tags, and its tags can only be set under "Ändern".
- Which days count as workdays is fixed: Monday to Friday. A holiday is planned by hand.
- A printed time often counts only the work at the stove. The tag suggestion knows that;
  the rule for recipes without a tag (`effortOf`) does not.
- The live search loads the whole library into the browser, about 880 recipes today. Watch
  how long that takes as the library grows.
- A recipe's own view of its page can miss the end of its steps where the text runs on in
  the next column: one of 24 views looked at. The whole page is linked below the view.
- The cookbooks were framed with the first way of asking, and only their turned pages and
  an overview of all pages were checked by eye. A page that still lies wrongly is framed
  again with `npm run import:frame-photos -- "<name>" --path <page> --again`.
- The cut-out view of a recipe that is deleted by itself stays in storage until its batch
  is deleted.
- The shopping list does not show yet what changed since it was last looked at, the shop of
  a line cannot be changed for one week, and ticking off needs a connection. The "Haben wir
  schon?" step is a plain section of the list for now.
- A recipe that is on a week plan cannot be deleted (foreign key). Deleting a batch whose
  recipes are planned therefore fails with an error instead of an explanation.
- The week's balance does not count legumes, although the brief asks for it: the import does
  not mark them, only two seed recipes carry the tag.
- A baking recipe without a printed servings line got whatever was entered in review, mostly
  "4 Portionen". "Ändern" on the recipe page sets its unit.
- A book that prints no servings with its recipes sends every one of them to review for that
  alone (106 recipes of "Freude am Kochen"). The upload form has no "servings unless printed"
  field yet.
- Handwritten recipes have never been measured. Expect more review for the household's own
  folders and try a few pages first.
- The test household "E2E-Test (automatisch)" and its login exist in the hosted project.
  `npm run e2e:teardown` removes them.
- The measurements cover five clean, well-lit pages. Watch the review rate and spot-check the
  first real cookbook batch.
- Shelf life, pack sizes and default shops in the catalog are estimates. The household
  corrects them in the app once the settings UI exists.
