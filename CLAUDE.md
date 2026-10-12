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
| Browser test of a real upload with the models (about 1 ct)                | `npm run e2e:upload`                           |
| Screenshots of every screen, phone and desktop, into `test-results/look/` | `npm run e2e:look`                             |
| A whole batch import from the command line, as the test user              | `npm run e2e:batch -- <photos>`                |
| Give already imported recipes the servings unit their photo prints        | `npm run import:servings-units -- "<name>"`    |
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
  new ingredients (done); 3b recipe library and week planner; 3c shopping list, print and PDF.
- Merging into `main` deploys migrations to the Supabase project (GitHub integration). A
  migration that is needed to test a branch is applied earlier with `npx supabase db push`;
  the merge then finds it already applied. Keep such migrations additive.
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

Shopping list

- Lines are built per canonical ingredient: scale, convert to the ingredient's default unit,
  sum, then round for purchase.
- Buying mode decides what is shown: `none` shows the name only, `count` a number of pieces,
  `weight` a weight, `pack` a multiplier only when more than one pack is needed ("2x Garnelen").
- Line text follows the handwritten list: quantity, name, note ("600 g Leberkäse",
  "Milch WS 1.29"). The exact sum and the meals it comes from stay available per line.
- The household's word is shown, not the recipe's (Karotten for Möhren). Synonyms map to one
  catalog ingredient.
- Shop is a household setting per ingredient and can be overridden per line for one week.
  Lines are grouped by shop, then by aisle group. A shop can override the aisle order.
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
- Not built yet in the import: retrying a failed page or recipe from the screen, editing a
  recipe after it was approved.
- A baking recipe without a printed servings line gets whatever was entered in review, so far
  mostly "4 Portionen". Its unit can only be set once recipes can be edited.
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
