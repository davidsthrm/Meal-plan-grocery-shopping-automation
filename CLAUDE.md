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
| Browser test of the shop without a connection (builds for production)     | `npm run e2e:offline`                          |
| Redraw the home screen icons from `src/app/icon.svg`                      | `npm run icons:build`                          |
| The same while `npm run dev` is already running                           | `E2E_PORT=3000 npm run e2e`                    |
| Create or remove that test household and its login                        | `npm run e2e:setup`, `npm run e2e:teardown`    |
| Browser test of a real upload with the models (about 2 ct)                | `npm run e2e:upload`                           |
| Screenshots of every screen, phone and desktop, into `test-results/look/` | `npm run e2e:look`                             |
| A whole batch import from the command line, as the test user              | `npm run e2e:batch -- <photos>`                |
| Give already imported recipes the servings unit their photo prints        | `npm run import:servings-units -- "<name>"`    |
| Turn stored page photos upright and cut out each recipe (calls the API)   | `npm run import:frame-photos -- "<name>"`      |
| Measure whether pages laid on any side come back upright (calls the API)  | `npm run import:eval-frame`                    |
| Describe recipes with tags: effort, dish, cuisine, season (calls the API) | `npm run import:tag-recipes -- "<name>"`       |
| Measure reading steps alone on the five sample photos (calls the API)     | `npm run import:eval-steps`                    |
| Steps for imported recipes: dry run with the cost, then per cookbook      | `npm run import:fill-steps -- "<name>"`        |
| Look for the supermarkets near a postal code, step by step (no database)  | `npm run supermarkets:search -- 88471`         |
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
- After that (branch `phase-5-notes-shopping-days`): a note per errand, the note for what
  ran out at home, the look of paper notes, a pictogram for every filter, the upload started
  from a planned meal, pages that follow each other across devices, saved plans, settings,
  and invitations into a household (done).
- Phase 6 (branch `phase-6-pwa-offline`): installable on iPhone and Android, the notes of
  the week kept for the shop, ticks without a connection, the view for the shop, and pages
  that say they need a connection.
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
  An account is made in one place only: `acceptInvite`, with the secret key, for someone who
  holds the link of an invitation a member made.
- The shopping list must work offline in the shop: cached list, queued check-offs.
- Installable: `app/manifest.ts`, icons drawn from the logo (`scripts/build-icons.ts`: the
  logo as it is, green to the edges for Android's mask and the iPhone), `appleWebApp` in
  the root layout. `src/proxy.ts` lets the manifest, `sw.js` and `offline.html` through
  without a login: the phone fetches the manifest without cookies.
- The service worker is plain JavaScript in `public/sw.js`, registered in the root layout
  (`ServiceWorker`). It touches only GET requests of the app: pages of `/einkauf` come from
  the network and are kept (in production a kept page is shown after 4 seconds without an
  answer: in a shop the connection hangs rather than fails), scripts and styles are kept
  as they load, and any other page without a connection shows `/offline.html`. The page
  names what to keep (`pagesForTheShop`, `KeepForTheShop`): the notes of the running week,
  each note, and the next errand when it lies in the week after. A copy asked for earlier
  never replaces one asked for later. `experimental.useOffline` stays off: with it a soft
  navigation offline waits forever instead of loading the kept page.
- Under `next dev` a kept page does not come to life offline (the dev runtime needs its
  socket), so the offline browser test runs on a production build (`npm run e2e:offline`)
  and skips itself under `npm run e2e`.
- A tick is "this line is ticked (or open) since then", not "toggle" (`Tick`,
  `src/domain/shopping-list/ticks.ts`). It is kept in IndexedDB first (`TickQueue`,
  `src/lib/tick-sync.ts`, `src/lib/tick-store.ts`) and sent to `/api/einkauf/haken` at once,
  when the connection comes back, when the app is opened again, and every 15 seconds while
  something waits. The server stores it with `tick_shopping_line`: per line the tick made
  last wins, by `shopping_line_state.checked_changed_at`; a tick sent twice changes nothing,
  and a time in the future counts as now. Two people ticking never undo each other. The
  device shows its own tick over a page drawn before the server took it
  (`shownChecked`, `WeekNotes.readAt`). Every tick on a note, also "Einkauf erledigt", goes
  this way; the plain form is the fallback without scripts.
- Without a connection every other form is stopped before it is sent and a bar says so
  (`ConnectionGuard`); only forms marked `data-offline-ok` go. Import and settings say at
  the top that they need a connection (`NeedsConnection`), and the batch page carries on by
  itself once the connection is back. Signing out (`data-sign-out`) makes the login page
  forget the kept pages and the waiting ticks of the device.
- Supabase Realtime tells an open page that the household changed something
  (`LiveRefresh`). A table that should do so is added to the publication `supabase_realtime`
  in a migration, guarded, because the embedded Postgres of the tests has no such publication.
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
  its meals, `?frage=<date>.<meal>` the meal a suggestion was asked for, `?mehr=<date>.<meal>`
  the meal "Mehr kochen" is open under), `/woche/auswahl`
  (choosing a recipe for a meal or for the extras), `/woche/lebensmittel` (what to buy for a
  meal without a recipe), `/woche/ziele` (the goals of a week), `/woche/verlauf` (all weeks,
  month by month), `/rezepte` (browse and search, called "Entdecken"), `/favoriten`,
  `/rezepte/[id]`, `/rezepte/neu` (a recipe typed in, or with `?art=text` pasted as text) and
  `/rezepte/[id]/bearbeiten` (a recipe corrected by hand), `/import/pruefen/angaben` (assigned
  fields that do not fit; `?feld=` one of them) and `/import/pruefen/doppelt` (duplicates;
  `?behalten=<id>&weg=<id>` asks before a merge), `/import/pruefen/schritte` (steps read with
  doubts), `/einkauf` (the shopping notes of
  a week as tiles; `?zettel=<date>.<place>` shows one of them picked up) with `/einkauf/pdf`
  (all notes, or with `zettel` one, as a PDF), `/merkzettel` (what ran out at home, as a
  page; the header pulls the same note down over any page), `/einstellungen` with `/einstellungen/vorrat` (what is usually at home), `/import`
  (`?d=<date>&m=<meal>` when it was opened from a meal planned as text), and outside the
  login `/einladung/[token]` (joining a household).
- `LiveRefresh` in the layout listens for changes to the plan, the lists, the note, the goals
  and to recipes, and calls `router.refresh()`: the page is read again from the server, under
  the same rules as on a reload. It also does so when a page comes back into view. The pages
  under `/import` are left out. A message about a deleted row carries only its key and
  reaches every signed-in browser, whichever household: nothing but "something changed" is
  taken from it.
- `/api/suche` hands the signed-in browser the library as a search index
  (`SearchIndex`: recipes, and per recipe which catalog ingredients it uses). The search
  field (`LiveSearch`) fetches it once per visit and searches it with the same pure
  `searchRecipes` the server uses, so a list unfolds with the first letter and changes with
  every further one. Sending the search still goes to the server and works without scripts.
- The week plan and the filters are plain forms and links: a server action per button, the
  filter in the address. They work before any script has loaded and need no client state.
- The API returns at most 1000 rows per request and cuts a longer answer off without saying
  so. Anything that can grow beyond that is read with `allRows` (`src/server/catalog.ts`):
  recipes, recipe tags, ingredient lines, import jobs, and the catalog itself. A table longer
  than a page is read four pages at a time (`readPages`), so its query needs a unique order:
  the ingredient lines of 880 recipes are eleven pages, and one after the other they kept
  the import page waiting for seconds. The catalog
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
  without calling a model: a made-up cookbook of twenty recipes ("E2E Kochbuch", "Zweites
  Buch"). It exists only while tests run: `e2e/teardown.ts` empties the test household after
  every run. The real household's recipes are never used for tests.
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
- No headings in capitals with wide letter spacing: the household reads them as machine-made.
  A small label (`.eyebrow`) is written as it is spelled.
- A few things are borrowed from the handwritten notes the app replaces, and only these: the
  week plan and every shopping list are a sheet of a pad (`.sheet`: holes along the top, two
  more sheets underneath), a list has ruled lines and a margin (`.ruled`) with a tick made by
  a pen (`.tickbox`), what ran out at home is written on a yellow note stuck on with tape
  (`.note`), a meal without a recipe carries a small yellow slip, and today is marked with a
  highlighter (`.marked`). No handwriting typeface. On real paper only a note's ruled lines
  are printed, faint, as in its PDF.
- The shopping notes of a week lie next to each other as small notes, a little askew
  (`.tiles`), each with the pictogram of its place on that place's pastel (`PLACE_LOOK`).
  One is picked up to work through it and comes closer (`.zoom-in`). The household found
  one long page of lists unstructured. Each tile is turned as one layer (`will-change`), at rest
  as under the finger, and the holes of a sheet are elements (`SheetHoles`), not a repeated
  background: either way round, the holes lay askew to the note and jumped when it was lifted.
- The Merkzettel does not open a page: it is pulled down over the open one on a string
  (`NoteDrawer`, a `<dialog>` that holds the note only while it is down), and pushed back up. A link to `#merkzettel` pulls it down
  too. Emptying a week sends a rubber over the sheet first (`ResetWeek`, `.erasing`). Going
  on to the next meal tears the meal's page off like a sheet of a pad (a React
  `<ViewTransition>` keyed by the meal, `.note-off` and `.note-on`, started only by that
  link's `transitionTypes`). All of it is off for whoever asked for less motion.
- Words on the screen say something concrete or are left out. No filler such as "for
  variety" or "just for you"; a suggestion without a reason shows none.
- The shared classes (`.btn`, `.field`, `.card`, `.chip`, `.title`, `.eyebrow`) are in the
  `components` layer of `src/app/globals.css`, so a utility class on the same element wins.
- One layout for all sizes: a single column on a phone, more columns from `sm` on. The week
  plan puts lunch and dinner side by side from tablet width. An iPad and an iPhone version
  with their own layouts are planned for later, so nothing may depend on hover or a mouse.
- A recipe has a pictogram (`pictogramFor`: pasta, soup, fish, cake, 21 in all, drawn as
  lines in `pictogram-paths.ts`). It stands large and pale behind a card's text
  (`.watermark`) and small on its pastel in front of a name (`.badge`). It is drawn sharp:
  the household did not want it out of focus. The kind of dish decides before what is in it:
  a salmon pasta is pasta. The dish a title names first decides before its sides: "Steak
  mit Pfefferrahmsoße, Pilzen und Spätzle" is meat. A meatless dish named after a vegetable
  with a picture of its own shows that one ("Pilze in Knoblauchsauce" a mushroom), and only
  the rest the carrot. Never a photo.
- Every way to narrow the library down has a pictogram too (`pictogramForFilter`, 24 more):
  each category, effort, kind of dish, cuisine, season, occasion, diet, and a book for a
  cookbook. A tag the household made itself is a label. They show on the tiles under
  "Stöbern" and on the filter chips. A new tag with a key needs an entry in `TAG_PICTURE`,
  or it is shown as a label. To look at a new drawing, render the paths with sharp: at the
  size of a badge a line is about a pixel wide.
- The logo is a plate with its cutlery on the app's green, and "Essensplan" with the plan in
  green (`logo.tsx`, `app/icon.svg`). On a phone the five sections are a bar that floats above
  the bottom of the screen (`.tabbar`), with a sign above each name and the open section on
  the green's pastel. It keeps clear of the iPhone's own home bar (`viewport-fit=cover` and
  `env(safe-area-inset-bottom)`): right at the edge, a tap on a section brought up the
  phone's gestures. Next to the Merkzettel stands the first letter of whoever is signed in
  on the green (`.account`, `initialOf`), the way to the settings, on every screen size.
- In the view for the shop the tick sits inside its box (`.tickbox-large`); on the note it
  runs past the box like a pen's. The view shows the supermarkets' logos as the note does,
  and the service worker keeps them for the shop: its own Content-Security-Policy (in
  `next.config.ts`) allows `https://*.wikimedia.org` and nothing else from outside.
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
buying the same quantity where the paper shows one (as many packs of what comes in packs:
"2x Garnelen" is 450 g), the same note, and an aisle order the handwritten order does not
contradict. Where the paper shows no quantity, the line may show the amount the recipes
need: the household asked for it in front of every line (October 2026). The handwritten week had one
shopping day, so the test builds its list for Monday alone (`singleTrip`).

Lines that come from a recipe the household has not added yet are listed under `pendingLines`
in `inputs.json`. When such a recipe is added to `supabase/seed/recipes.ts`, give the plan slot
its `sampleRecipe`, remove the lines from `pendingLines`, and the test must still pass.

## Domain rules

Household

- Default servings: 4.
- A household says on which weekdays it goes to the supermarket and to the market
  (`household.shopping_days`, read with `readShoppingDays`, set on `/einstellungen` and asked
  on the first visit). Until it has, the app's own hold (`DEFAULT_SHOPPING_DAYS`: supermarket
  on Monday and Friday, market on Saturday). At least one day must be at a supermarket, where
  everything else is bought. `household.shopping_weekday` is no longer read.
- The butcher and the bakery have no weekdays (`ON_DEMAND_PLACES`): the household did not
  want standing days for them. They are gone to for the meal that needs something from
  there, on the day of that meal, and on the Saturday for a Sunday (`onDemandDay`). Days once
  stored for them are ignored.
- The drugstore (dm, place `drugstore`) has one weekday, Saturday until the household picks
  another on `/einstellungen` (`household.drugstore_weekday`, merged into the shopping days
  by `withDrugstore`). It is kept apart from `shopping_days`, which older versions read
  strictly. Its note lies among the others every week, empty until someone writes on it.
- A family shares one household, everyone with an account of their own
  (`household_member`, with the name the household calls them by). A member makes an
  invitation on `/einstellungen` (`household_invite`): a link that works once and for seven
  days, of which only a hash is stored. Whoever opens it gives a name, an e-mail and a
  password, gets an account and belongs to the household (`acceptInvite`). An account
  belongs to one household; someone who has one cannot use an invitation.
- The household's name (`household.name`, "Stührmann", set in the family card of
  `/einstellungen`) is spoken of as the family in two places, read from the data: the empty
  shopping notes ("Bei den Stührmanns …") and the invitation ("Die Stührmanns laden dich
  ein"), through `familyName`, which says nothing for a name that is no single family name
  ("Zuhause"). The week plan greets whoever opens it by the first word of their own name
  as a large title, the way an app's first screen does: the day small above it, "Guten
  Morgen, David" by the time of day (`salutation`, `firstName`; `.greeting`, the name in the
  accent green), and "Euer Wochenplan · 12.–18. Oktober" below as the page's heading.
  Without a name, the plain label and the week as the title. Nowhere else.
- A new household for another family is not made in the app: it needs its own catalog,
  tags and categories, as `npm run e2e:setup` makes them for the test household.

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
  plans on the weekend. From Thursday on it opens on the coming week already when nothing is
  planned for the rest of the running one (`openingWeek`); earlier an empty week is still the
  one to plan.
- Above the sheet stands one row: the views "Mahlzeiten" and "Außerdem" on the left, what is
  done with the whole plan on the right ("Plan vervollständigen", "Woche leeren", "Plan
  speichern" last). On a phone the actions wrap below the views.
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
  invitation. They count for the shopping list, not for the balance. Each can name the day
  of the week it is needed (`plan_extra.needed_on`, `PlanExtra.date`): it is then bought
  for that day exactly like a meal on it. Without a day it is bought on the week's first
  supermarket day.
- A meal without a recipe can carry foods to buy (`plan_slot_food`): bread, cold cuts and a
  cucumber for a "Vesper". A food is a name, not an amount. It may name where it is bought
  for that meal (`VESPER_FOODS`: bread from the Bäcker, cold cuts from the Metzger), whatever
  the catalog says for cooking. Foods are copied with the meal to the next week.
- A typed meal whose text is the title of a recipe is planned as that recipe. Any other typed
  meal stays text and says "Noch kein Rezept dazu". "Hochladen" opens the upload for that
  meal: the batch remembers it (`import_batch.for_date`, `for_meal`), and once every photo is
  read and the recipe approved, by itself or after review, the recipe stands on the meal
  instead of the text (`placeForMeal`). One recipe read is the one; of several on a page it
  is the one named like the meal (`recipeForMeal`), and if that does not decide it, nothing
  is planned. A meal that was emptied or planned otherwise meanwhile is left alone.
  "Eintippen" opens the recipe form with the title filled in and puts the saved recipe on
  that meal. The household plans with the cookbook next to it.
- The page that plans one meal (`/woche/auswahl`) is a stop of its own: what is picked there
  is planned and the page stays, saying what the meal is now ("Geplant: …"). "Nächste
  Mahlzeit" leads to the next lunch or dinner that has nothing planned yet, into the next
  week too (`nextOpenMeal`); coffee on Sunday is passed over. "← Wochenplan" leads back.
  Picked anywhere else (a suggestion, a recipe being placed), the week is shown again.
- Some meals never have a recipe and are one tap away (`MEALS_WITHOUT_RECIPE`): Vesper,
  Reste, Auswärts, Oma Heidrun, Keiner daheim. Typed in, such a name is that meal (`namedMeal`),
  and no upload is offered for it. "Braucht keins" on any other typed meal makes it a meal
  away from the kitchen that keeps its name ("Pizza bestellen").
- A plan the household is done with is saved (`week_plan.saved_at`, "Plan speichern"). A
  saved plan is read: the meals stand there without the controls for planning, without
  suggestions, and each with a small pen that opens that one meal (`?stift=<date>.<meal>`).
  "Plan bearbeiten" opens the whole plan again. Saving is a decision, not a date: a week
  that has begun is not locked by itself.
- Above the plan of the running week stands what there is to eat today and what the weekend
  holds (`Today`), also while the page already shows the coming week. Once something is
  planned for those days, it stands next to the greeting like a widget on a large screen,
  and under it on a phone; otherwise the header is the greeting alone.
- "Woche leeren" empties a week after asking: every meal and the extras (`resetWeek`).
  The rubber makes the sheet invisible with a class that `ResetWeek` takes off again as
  soon as the empty week is drawn; left on, the page stayed blank. Playwright calls an
  element with opacity 0 visible, so the test asks for the opacity.
- A recipe opened from the week plan or from the favourites leads back there
  (`lib/origin.ts`: the link carries `?von=woche&w=<week>` or `?von=favoriten`); from
  anywhere else it leads to "Entdecken". Nothing but a week is taken from the address.
- Every recipe and food on a meal remembers the day it was planned (`planned_on`,
  `SlotItem.plannedOn`). A meal written again with other servings or another side keeps the
  day of what was there. Null for what was planned before this was recorded.
- A suggestion has points and reasons (`scoreRecipe`): +8 when someone wants to cook it, +3
  when its group is still below the least the week should have, -4 when its group is used
  up, +2 for a favourite, -3 when it was on a plan in the last 4 weeks, +1 when it was last
  cooked 8 weeks ago or longer. Equal recipes are ordered by a seed (week, meal), so the
  order is stable between two looks.
- The plan does not fill itself. An open meal has "Planen" and "Hast du einen Vorschlag?".
  Asked, the meal shows one suggestion with its reasons, "Gute Idee!" to take it and "Noch
  ein Vorschlag" for the next best; after twelve they come round again. The household found
  a plan that arrives full of suggestions too pushy.
- Up to five open meals offer a suggestion without being asked: those with the most to say
  for them (a wish, a favourite, a gap in the week; `HINT_SCORE`), spread over the week. It
  is the same box as an answer to "Hast du einen Vorschlag?", with a dashed edge and
  "Vorschlag" on it, so that it does not read as planned: "Gute Idee!" takes it, "Noch ein
  Vorschlag" shows the next best. More wishes and favourites mean more such meals, up to
  five. The household took the pale ideas shown before for planned meals.
- "Plan vervollständigen" plans every open meal that is still to come at once. Those
  suggestions are chosen one after the other as if the earlier ones were accepted
  (`suggestWeek`), so that the completed week meets the targets. Nothing is suggested twice
  in a week. A wish goes to the first meal it suits. A meal that could run out, with fewer
  suitable recipes left than meals still open, is chosen for before the others: filled from
  Monday on, the lunches took the salad and the fish of a small cookbook, and Thursday
  evening, which takes only what is light and quick, got a third meat dish. With the
  household's library no meal is that tight, and the week is filled in its order. What a
  pick says for itself is said of the week as planned, not of the order it was chosen in.
- Suggested are main dishes and soups, in the evening also salads and cold suppers: lunch is
  the cooked meal in this household. Anything can still be planned by hand for any meal.
- The evening is light, on any day (`suitsDay`): nothing heavy is suggested for it, that is
  pasta, rice, potatoes or a casserole (`dishOf`: category, then the "Gericht" tag, then any
  dish word of the title, a side included), so a pasta salad is a salad and a steak with
  Spätzle is heavy, though its pictogram is the steak. A soup, a wrap or
  toast from the oven is fine. The household had Avocado Spaghetti suggested for a dinner.
- From Monday to Friday nobody cooks for hours (`suitsDay`): lunch is suggested from what
  is quick or fits a normal day, the evening only from what is quick or cold. A recipe whose
  effort is not known is kept for the weekend. The household had many warm main dishes
  suggested for workday evenings that it could never cook then.
- "Möchte ich kochen" marks a recipe someone wants to cook soon (`recipe.wanted_at`). It is
  suggested before everything else, shown below the plan to be placed with one tap, and the
  mark goes as soon as the recipe is on a plan (`fulfilWishes`), as a meal or as an extra.
  There can be dozens, so they are grouped by kind in the kind's pastel (`groupRecipes`
  with `BY_KIND`), eight per kind until "weitere" shows all (`?wuensche=alle`). A grouping
  by a group of tags (`byTag`) is ready for when the wishes should be sorted that way.
- "Mehr kochen" on a planned meal cooks extra portions for leftovers. They are the meal's own
  number (`plan_slot.extra_servings`, `PlanSlot.extra`), apart from its persons: the meal
  shows "4 Personen" and below "2 Extra-Portionen" with minus and plus, so a third person at
  the leftovers makes it 3; zero cooks the meal as planned again. The list buys them with
  every recipe of the meal that is cooked for persons (`cookedServings`); a cake for one tin
  is not baked twice. The later meal picked for the leftovers, an open lunch or dinner of the
  next three days (`openMealsAfter`, `LEFTOVER_DAYS`), becomes "Reste" with the meal it is
  from (`plan_slot.leftovers_of_slot_id`), and the extra portions say for which meal they
  are. A meal planned meanwhile is left alone. A meal written again keeps its id
  (`writeSlot` updates in place), so the link holds.
- A planned meal's actions are signs in one row, each with its words as label and title:
  a pen to change it, a plus for a side, a bin to empty it; "Mehr kochen" is the one word
  among them, a small button that opens its form under the row (`?mehr=<date>.<meal>`,
  "Übernehmen" or "Abbrechen"), the way a suggestion is asked for. The household found the
  row of words, and "Mehr kochen" on a line of its own, took too much room in the plan;
  folded open inside the row it stood beside the signs in Safari.
- "Alle Wochen" (`/woche/verlauf`) lists every week with a plan, month by month and newest
  first, with its calendar week, its meals day by day and its count per kind. A week counts
  for the month most of its days are in. The week being planned is always listed.
- A recipe for persons is planned for the household's servings, a recipe with a servings
  unit as written.

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
- A card shows the printed minutes, and where the cookbook prints none the effort instead
  (`timeText`). Of the household's 880 recipes all have an effort and 452 a printed time
  (October 2026). Nobody has to fill in times after cooking; the effort is changed under
  "Ändern" where it is wrong.
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
- A recipe has its preparation steps, one entry per printed step in printed order
  (`recipe.prep_steps`, `src/domain/import/steps.ts`). Null means nobody has read them yet,
  an empty list that the photos show none. They are folded away on the recipe page
  ("Arbeitsschritte", a `<details>` below the ingredients, numbered), like the photo: the
  household keeps cooking from the book on the shelf and did not want the app to replace
  it. The steps matter most for recipes that came in as text. A recipe without any says
  "Keine Arbeitsschritte vorhanden". A part the
  model could not read is "[…]", never a guess. Steps are typed and corrected one per line,
  on the review screen, on `/rezepte/[id]/bearbeiten` and in the form for a typed or pasted
  recipe (`readTypedSteps`); nothing typed keeps them unknown. The old column `recipe.steps`
  was never written and is not read.
- Recipes imported before steps were read get them from their stored page photos with
  `npm run import:fill-steps`, one cookbook at a time: a reading of the steps alone
  (`STEPS_PROMPT`, `createAnthropicStepsReader`) and a check of them (`STEPS_VERIFICATION_PROMPT`),
  the cut-out of a recipe sent with its page. Ingredients are not touched. Such a recipe is
  approved already, so a doubt does not send it to review: the steps are stored with their
  doubts in German (`prep_steps_doubts`, `settleSteps`). The recipe page shows them above the
  steps, and "Arbeitsschritte prüfen" (a third tile under "Prüfen", `/import/pruefen/schritte`)
  lists such recipes with photo and steps side by side: "Stimmt so, übernehmen" stores the
  steps as they stand in the field and clears the doubts. Saving the recipe's form does too. Steps a person saved are
  never overwritten. Without --write the script only counts and estimates.
- The recipe page shows the photographed page folded away (`<details>`): what is cooked from
  are the ingredients above it. Opened, it shows the recipe's own part of the page where it
  shares the page with others, with a link to the whole page below.
- A recipe without a printed time is never "quick".
- Without a filter the page shows a few shelves that change with the day (`discover`):
  quick meals, what is tagged for the season, long not cooked, new. They bring up what nobody
  has marked yet (`isMarked`): favourites and what someone wants to cook are on "Favoriten"
  and on no shelf. A shelf shows ten recipes in an order that changes by the day; its "Alle"
  link lists everything behind it, marked or not. "Entdecken" has no favourites chip
  (`/rezepte?favoriten=1` leads to `/favoriten`) and no button to add a recipe: that is
  under Import ("Ohne Foto: Rezept eintippen"). Below the shelves "Stöbern" is a directory (`directory`): every category,
  tag, diet and cookbook as a tile with the number of recipes behind it. A library of up to
  thirty recipes is also shown whole.
- A recipe card has a heart in its corner (`FavoriteHeart`): a tap makes the recipe a
  favourite or takes the mark away, without opening it. The heart is a form next to the
  card's link, not inside it, and both lie in the card that lifts. A recipe made a favourite
  on "Entdecken" leaves its shelves.
- A recipe's page offers "Einplanen" and "Möchte ich kochen"; the favourite is the same heart
  as on a card, next to its title, and a pen next to "Zutaten" opens the form to change it
  ("Rezept ändern"). Under its facts it
  says when it was last cooked (`lastCooked`: the latest meal before today it was on, from
  the whole plan history), or "Noch nie gekocht". Its ingredients stand in the order the
  cookbook prints them: `recipe_ingredient.position`, written in reading order by every way a
  recipe is saved. A recipe on the plan of the week the household is in (`currentWeeks`: the running
  week, from Thursday on also the coming one), as a meal or as an extra, says "Eingeplant"
  instead, grey with green writing, and leads to where it stands (`plannedAt`).
- "Favoriten" has a page of its own: on top what someone wants to cook, then the favourites
  sorted by category (`byCategory`). Its search and filters look through favourites only.
- A recipe can be pasted as text (`/rezepte/neu?art=text`): the reading model reads it by
  the rules for photos (`createAnthropicTextReader`), and what it read fills the form for a
  typed recipe (`pastedRecipe`), where a person checks it before anything is saved. What
  needs a look is listed above the form: no title, no servings, a line the model was unsure
  about, an alternative that was left out, no steps. Its steps fill the form's steps field
  and are stored like any other. The pasted text is kept with the recipe
  (`recipe.source_text`) and shown folded away on its page. Tried on
  one made-up web page with navigation and a story around the recipe: all nine ingredients
  right, about 0.2 cents.

Shopping list

- Lines are built per canonical ingredient: scale, convert to the ingredient's default unit,
  sum, then round for purchase.
- Every line shows the amount needed in the ingredient's own unit, whatever its buying mode
  (`purchaseFor`): "200 g Crème fraîche", "400 g Champignons", "1 Bund Petersilie", pieces as
  "1x Schalotte", as on the dm note. `count` and `weight` round to the catalog's step,
  everything else to whole pieces or just enough to read well (`naturalStep`: 137,5 g is
  140 g). The household found "Champignons" one week and "4x Champignons" the next, and had
  to open "Crème fraîche" to learn it was 200 g. What comes in packs says how many packs
  with the exact amount, on tap (`packsFor`). Only a line without any amount ("Petersilie")
  and one asked for by the spoonful only ("Salz") show the name alone.
- Line text: quantity, name, note ("600 g Leberkäse", "Milch WS 1.29"). The exact sum and
  the meals it comes from stay available per line. A note picked up is one column on screen,
  the width of the page, so that an opened line has room: what it is for on the left, amount
  and note on the right, its buttons in one row below. On paper it keeps its columns.
- The amount of a line can be changed on its note ("Menge ändern", `LineState.amount`,
  `shopping_line_state.quantity` and `unit`). The line then says what the plan has, and
  "Wie geplant" takes the change back. The change stays when the plan changes.
- The same thing on another open note of the week (small tomatoes on Monday's supermarket
  note and Saturday's market note) is said under the line ("Auch auf: Sa 17. Markt",
  `alsoOn`). "Dort mitkaufen" moves the line there where that is not too late and it keeps
  (`dayProblems`); otherwise it is only said.
- The household's supermarkets are found by its postal code (`household.postal_code`,
  `place_name`; empty for a new household, and until it is entered no market can be
  chosen). The server looks the code up on OpenStreetMap (Nominatim), asks Overpass for the
  supermarkets inside its area and offers all of them, each name once (two shops of one name
  are one chain), with the chain's logo from Wikidata and Wikimedia Commons. Showing only
  the nearest five left out Aldi and Lidl in Laupheim. Chosen ones stand first, then the
  chains and the rest by name (`src/server/supermarket-search.ts`,
  `pickSupermarkets`). They are kept as shops (`shop.found_near`, `logo_url`, `address`).
  None of it is hard-coded: the household's own is 88471 Laupheim, entered in the app. While
  the search runs, which can take up to a minute, the card says so (`SearchPending`). A tap
  on a market makes it one of the household's or no longer one, the first one chosen being
  the main market; the star next to a chosen one makes it the main one
  (`shop.supermarket_rank`, 1 the main one; `favouriteSupermarkets`). A market the map does
  not know can be typed in. A supermarket note buys everything at the main one. A
  line can be bought at another one for the week ("Kaufe ich bei: Rewe",
  `shopping_line_state.shop_id`): that supermarket then has a section of its own on the
  note, on paper and in the PDF (`sectionsByShop`). One without such a line has none. Where
  the catalog buys a thing (`preferredShopId`) does not decide the section. The logos stand
  wherever a supermarket is named (`ShopLogo`, the name's first letter without one): the
  supermarket note is named after the markets it is taken to, the main one first, and shows
  their logos in place of the cart: "Aldi & Rewe", "Aldi, Rewe & Botzenhardt"
  (`marketsOfNote`, `namesText`), its PDF too; each further one has its logo at its section and on its button "Bei EDEKA kaufen", a button like "Haben wir
  schon". A logo's size is set in pixels on the element, never by a class: with a size class
  the stylesheet lacked, the 128-pixel picture filled half the note.
- The household's word is shown, not the recipe's (Karotten for Möhren). Synonyms map to one
  catalog ingredient. One piece takes the singular when the catalog lists it among the other
  names: "1 Zitrone".
- Shop is a household setting per ingredient and can be overridden per line for one week.
  The list by shop (`presentList`: by shop, then by aisle group, a shop can override the
  aisle order) is what the acceptance test compares with the handwritten list.
- The household does not plan by supermarket for now. What it sees, prints and exports is
  each day's list by kind of grocery (`presentByAisle`): one walk through a shop, Obst &
  Gemüse to Sonstiges. A line shows its shop only where one was named on purpose (`shopByChoice`):
  "Brot · Bäcker" for a cold supper.
- Every errand has a note of its own: a place on a day (`ShoppingTrip`, as an address
  `<date>.<place>`). A need goes to the supermarket's last shopping day on or before its meal
  (`assignTrip`): Monday buys for Monday to Thursday, Friday for Friday to Sunday. What a
  kind of grocery says is bought fresh elsewhere (`aisle_group.fresh_place`: fruit,
  vegetables and fish at the market, meat at the butcher; the household's to change on
  `/einstellungen`) goes on that place's note. For the market that is when its day is at
  most three days before the meal and it keeps until then: the weekend and the start of the
  week, also though Monday is a supermarket day. Meat is a note for the butcher on the day
  it is cooked. A household that buys everything in one go, like the one of the handwritten
  list, says so with `onDemand: []`.
- An errand does not buy for what was planned after it. A week planned on Sunday gets
  nothing from Saturday's market; its vegetables for Monday are on Monday's note.
- What would not keep from its shopping day, and what was planned after the last shopping
  day before its meal, is bought shortly before (`trip` "later"). It is no section of its
  own: the line stands with its kind of grocery. Only what goes bad knows for which day it
  is bought ("für Do. 15. Oktober", `neededBy`): tomatoes and yoghurt, not flour. The day is
  shown when the line is opened with a tap, not on the line, and not on paper or in the PDF:
  the household found a date on every line too much.
- A note is the same real errand from whichever week it is looked at: Saturday's market note
  holds what the weekend needs and what Monday and Tuesday of the next week need, summed.
  The page of a week shows the errands in it, and one before it when that buys for the
  week. `loadShoppingNotes` therefore reads the plans of the weeks around it.
- A shop named on purpose is gone to in any case (`shop.kind`, `Need.at`): the butcher and
  the bakery on the day of the meal, the market on its day when that reaches the meal and
  otherwise on the day of the meal too, which then has an errand of its own. Bread and cold
  cuts for a "Vesper" on Monday are a note for the bakery and one for the butcher on Monday,
  next to the supermarket's. So a week shows the household's shopping days and every other day
  something is bought on.
- An errand can be done on another day ("An einem anderen Tag einkaufen" on its note,
  `changeNoteDay`). The note offers the three days before and after and says for each
  whether it works, and if not, why (`dayProblems`): something on it is needed before that
  day, or would not keep from that day until its meal, or the day is over. A line that
  belongs to no meal, and one that is bought shortly before its meal anyway, is no obstacle.
  The household asked to be told why, not just to be stopped. Changing the day moves every
  line of the note to the same place on the new day; what the plan adds later is again put
  where it belongs by itself.
- An errand is done when every line of its note is ticked: by the last tick, or by
  "Einkauf erledigt", which ticks what is still open. The note then pales among the others
  and carries a stamp with the name of whoever made the last tick (`NoteList.completed`,
  from `shopping_line_state.checked_by` and the member's `display_name`). Nothing is stored
  for it: a line the plan adds afterwards opens the errand again, which is what it is.
- A line can be moved to another note: the household decided to buy it on another errand
  ("Lieber woanders kaufen", `moveLine`). The move is stored with the note the line would be
  on by itself (`shopping_line_state.moved_date`, `moved_place`) and applied before the
  lines are summed, so a moved line adds up with what its new note needs anyway. Every part
  of a line knows the note it came from (`Contribution.origin`).
- What is needed and at home is one list for the whole week, under the notes ("Haben wir
  schon"), not one per note: each thing once, by kind of grocery, without the note it would
  be on (`groupAtHome`). "Doch kaufen" puts every line it stands for back on its note while
  that errand is still to come, and otherwise on the next note from today on that sells it
  (`noteToBuyOn`), where it is not at home either.
- For an ingredient bought in packs, a typed "2x" or a bare "2" means two packs.
- "Haben wir schon?": pantry staples are pre-ticked as at home. A line the user added by hand
  is never pre-ticked. The staples are the household's to change: a tile in the settings
  opens `/einstellungen/vorrat` (`ingredient.is_pantry_staple`), the staples by kind of
  grocery (`pantryByAisle`), with a search that follows while typing through the whole
  catalog (`searchCatalog`), to take each out or put it in with one tap. The household found
  the 180 staples as chips on the settings page unstructured.
- Free entries are first-class. "Milch WS 1.29" is matched to the catalog (Milch) and keeps
  the rest as a note. Text that matches nothing stays a free line.
- When the plan changes, lines are recomputed and matched by a stable line key
  (`<ingredient>@<trip>`), which is unique on one note. Notes, shop overrides, at-home marks
  and check-offs belong to the note and the key and survive. A meal moved to another
  shopping day is a new line there: a tick on Monday's note does not say it was bought for
  Friday. A change is reported only when the quantity shown changes.
- The notes are worked out from the plan every time they are shown (`loadShoppingNotes`), so
  they cannot disagree with the plan. Stored are only what the household does by hand, per
  note (`shopping_list` has one row per household, date and place): typed entries
  (`shopping_manual_entry`) and, per line key, tick, note, "we have that" and the note it
  was moved to (`shopping_line_state`). The table `shopping_line` is not written yet. Lists
  made before there were several shopping days keep their week (`week_plan_id`); new ones
  have none.
- A line typed onto a note stays on that note, unless it is moved.
- The drugstore's note is written by hand only, never from the plan: what, how many and,
  if it is for someone in particular, for whom (`shopping_manual_entry.quantity`,
  `for_whom`; "2x Duschgel für Lena", one of something is just its name). Typing suggests typical drugstore items
  (`DRUGSTORE_ITEMS`), "Für wen" the names of the household's members. Each line is sorted
  into a section of the shop, Körperpflege to Haushalt (`drugstoreSection`: the longest
  known word in what was written wins, anything else is "Sonstiges"). Its lines are not
  moved to a food note, have no "Haben wir schon", and the note is not moved to another day.
  What is still open on a dm note whose day is over comes along to the next one from today
  on (`carriedOver`, `nextDrugstoreTrip`, eight weeks back at most), until it is ticked or
  removed. A tick on the note it came along to is stored there; an entry ticked on any
  earlier note stays behind.
- The Merkzettel (`restock_item`, in the header of every page with the number of its
  entries) holds what ran out at home. It is not a shopping note: "Auf den Einkaufszettel"
  moves an entry to the note of the next errand from today on that sells it (`restockTrip`),
  where it is a typed line, and takes it off. Flour noted on a Saturday waits for Monday;
  carrots are bought at the market that day. What the drugstore sells (`isDrugstoreItem`,
  "Zahnpasta", also "Spülmittel" that the food catalog knows) goes to the next dm note, a
  number in front, in digits or words, as its quantity (`drugstoreEntryFromText`: "2
  Duschgel", "zwei Zahnpasta"), and is sorted
  into its section there. Where an entry is bought fresh is looked up in
  the catalog once, when it is written (`restock_item.fresh_place`), so that the header of
  every page can say where each entry goes without reading the catalog. While it has
  entries, the Merkzettel also lies among the shopping notes.
- Besides the cooked meals the lists hold the week's extras, scaled like a meal and bought for
  their day like a meal, or without a day on the week's first supermarket day, and the foods
  of meals without a recipe, by name and without an amount. The exception is a food named as one piece of something bought by the piece:
  "Gurke" for the catalog's "Gurken" is "1 Gurke" and adds up with what recipes need
  (`namesOnePiece`). Named in the plural it stays a name. A food bought somewhere else than the catalog says is its own line
  (`<ingredient>@<trip>@<shop>`). What someone asked for by name is never assumed to be at home.
- Export: the page has a print layout (black on white, a box per line, no controls, on the
  paper of the PDF: `printRules` sets page size, columns and size of the writing from
  `NOTE_PAPER`) for the note that is picked up, and `/einkauf/pdf` writes notes with `pdf-lib`:
  each note as a file of its own, or all of them in one file, every note on its own page.
  Both show what is still to buy, without what is ticked off or at home. The PDF is a small
  notepad sheet to take along instead of a phone: A6, one column, black on white, faint
  ruled lines, no binding holes. The size is one constant for both (`NOTE_PAPER`
  in `src/lib/note-paper.ts`, with A6, A5 and A4 laid out). A note taken to several
  supermarkets has a section per supermarket in the PDF too, its name once above its kinds
  of grocery (`pdfSections`), not in front of every heading.
- "Jetzt einkaufen" on a note opens the view for the shop (`StoreView`, a `<dialog>` over
  the whole screen; `#laden` opens it too): the note's lines by supermarket and kind of
  grocery, each row one large button to tick, how many are ticked of how many, whether
  ticks wait for a connection ("Offline – 3 Häkchen warten", `SyncStatus`), and "Einkauf
  erledigt". The screen stays on while it is open (Wake Lock, where the browser has it).

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
- Review (`/import/pruefen`) shows photo and fields side by side. Everything typed is checked
  again on the server by `readReview`. Approving replaces the recipe's lines.
- Model instructions live in `src/server/import/prompt.ts`. Their examples must not come from
  the sample recipes, or the measurements stop meaning anything.
- Measured on the five sample photos with `claude-haiku-5-5` (October 2026): 15 of 15 readings
  without a mistake over three runs, 25 of 25 planted mistakes caught by the second pass, no
  false alarm, about 0.35 cents per recipe for both passes. Re-measure after changing a prompt
  or a model.
- The reading copies the steps as well (`STEP_RULES`, shared with the reading of steps alone).
  The second pass checks them for structure and numbers, not word by word: every printed step
  there and in order, none from a tip box, each read to its end across columns, and every
  time, temperature and amount as printed (`STEP_CHECK_RULES`). A step with "[…]", one that
  breaks off mid-word or on a comma, or no steps where the first look at the page saw some
  (`stepProblems`, `surveySawSteps`) send a recipe to review. Measured with steps (October
  2026): ingredients still 5 of 5 without a mistake; 20 of 22 steps exactly as printed, the
  other two with one word normalised ("einkochen" for "einköcheln", "Stengelansätze"), no
  number wrong; 38 of 38 planted mistakes caught, the 13 in the steps included, no false
  alarm; 0.43 cents per recipe for both passes, 0.08 more than without steps. Reading the
  steps alone from a stored page: 0.21 cents for both requests, the same two words, stable
  over three runs. The steps of the five samples are transcribed by hand in the fixtures.

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
- The checks of assigned fields and the duplicate rules were tried on made-up recipes and
  the seed only, not on the household's 880 recipes. Watch for false alarms (a word list
  decides what is meat or fish) and tune the lists in `quality.ts`.
- Editing a recipe on `/rezepte/[id]/bearbeiten` does not mark its fields as checked.
- The steps of the 875 recipes imported before steps were read are not filled in yet:
  `npm run import:fill-steps -- "Stührmann" --write --all`, estimated at about $2.20. Tried
  on three recipes of "bunter Ordner": one read without doubt, a handwritten one with its
  unclear words named, and one the check caught with steps missing.
- The check of steps let a paragraph pass that the reading had split in two (one run of
  five). The text was complete, so nothing is lost for the cook.
- The reading sometimes writes a word the way it is usually spelled rather than as printed.
  Asked in the instructions to copy the letters, it did no better and split a step instead.
- A recipe whose steps run on to a page that was not photographed has the steps up to there
  and a doubt; the rest can be typed on `/rezepte/[id]/bearbeiten`.
- The live search loads the whole library into the browser, about 880 recipes today. Watch
  how long that takes as the library grows.
- A recipe's own view of its page can miss the end of its steps where the text runs on in
  the next column: one of 24 views looked at. The whole page is linked below the view.
- The cookbooks were framed with the first way of asking, and only their turned pages and
  an overview of all pages were checked by eye. A page that still lies wrongly is framed
  again with `npm run import:frame-photos -- "<name>" --path <page> --again`.
- The cut-out view of a recipe that is deleted by itself stays in storage until its batch
  is deleted.
- The shopping list does not show yet what changed since it was last looked at. Without a
  connection only ticking works; typing a line, moving it or changing its amount needs one.
  Only a supermarket line can be bought at another shop for a week. The "Haben wir
  schon?" step is a plain section of each list for now.
- The shopping days are the same every week. For a holiday on a shopping day the errand is
  moved to another day by hand ("An einem anderen Tag einkaufen").
- Moving a single line to another note is not checked the way moving a whole errand is: the
  household can put cream needed on Monday on Friday's note.
- Cheese and antipasti come from the market in this household, but the catalog keeps cheese
  with the dairy and antipasti with the jars. The settings choose per kind of grocery, not
  per ingredient, so they stay on the supermarket's notes unless each line is moved.
- A member cannot be removed from a household in the app, and there is no way to change a
  password or to recover a forgotten one. Both are done in the Supabase dashboard.
- Inviting someone needs no e-mail to be sent: the link is passed on by hand. Supabase's own
  mail server only writes to the project's team, so mail from the app would need another one.
- Other families: a household of its own cannot be opened from the app yet. Before that,
  decide who pays for reading recipes, since every household's imports use the same API key.
- A meal planned on a shopping day after the shopping was done is still put on that day's
  list, where it shows as open: only the day of planning is known, not the hour.
- What one device changes shows on the others while they are online. A phone without a
  connection in the shop sees the notes as they were when it last had one, with its own
  ticks; the counts on the tiles among the notes do not include ticks that still wait.
- A note is kept for the shop only once the device has opened the shopping notes of the
  running week online. The week plan, recipes and every other page are not kept.
- The offline flow was tested in Chromium (Playwright). On an iPhone, check once by hand:
  installed from Safari, open a note, airplane mode, tick, reopen the app, back online.
- An upload started from a meal plans nothing when its page holds several recipes and none
  is named like the meal. The recipes are in the library and are planned by hand then.
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
