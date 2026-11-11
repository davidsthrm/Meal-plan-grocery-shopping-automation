# Architecture

The stack, hosting limits, security, the installed app and offline behaviour, live updates, speed
decisions, code layout, routes, data access and tests of Essensplan.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind 4, installable as a PWA.
- Supabase in Frankfurt: Postgres, Auth, private Storage bucket, RLS on every table.
- Supabase no longer grants table privileges automatically. Every migration that creates a
  table must grant to `authenticated` and `service_role` explicitly and revoke from `anon`.
- Keys are the new Supabase ones: the publishable key for the browser, the secret key for the
  server only.
- Vitest for unit tests, Playwright for a few end-to-end flows.
- UI text is written in German directly in the components. There is no strings file.
- Cache Components are switched off (`next.config.ts`): every page is private and read per
  request. Read `node_modules/next/dist/docs/` before using a Next.js API; version 16 differs
  from older ones (`proxy.ts`, async `params`, `PageProps<"/route">`).

## Hosting and limits

- Hosting on Vercel Hobby, functions in `fra1` next to the database, Fluid compute
  (`vercel.json`): a function has 300 seconds. A model request gives up after 90 seconds
  and is retried once only when the service is busy (`sharedClient` in
  `anthropic-reader.ts`); the supermarket search has one deadline of 240 seconds for itself
  and its street lookups (`SEARCH_BUDGET_MS`). Setup, variables, rollback and backups are in
  `docs/DEPLOYMENT.md`.

## Login, accounts and security

- Login with email and password, accounts by invite only, sign-up disabled.
  An account is made in one place only: `acceptInvite`, with the secret key, for someone who
  holds the link of an invitation a member made.
- Passwords are Supabase Auth's. "Passwort ändern" on `/einstellungen` asks for the current
  one first. "Passwort vergessen?" on the login page (`/passwort-vergessen`) has Supabase
  send a link to `/auth/bestaetigen`, which signs in, and `/passwort-neu` takes the new
  password. The answer never says whether an address has an account. The proxy lets those
  two pages through without a login.
- A preview deployment works on the real database. It lets only `PREVIEW_ONLY_EMAIL` (the
  test household) sign in, the proxy signs anyone else out, and invitations are not taken
  there (`src/lib/preview.ts`), so every invitation link is one of production. Vercel's
  Standard Protection keeps previews to the team as well.
- Every response carries security headers (`SECURITY_HEADERS` in `next.config.ts`): no
  frames, no sniffing, the origin only as referrer (an invitation's secret is in its path),
  HSTS, and a policy without frames, plugins or foreign form targets. Scripts are not
  limited by it: the pages need Next.js's inline scripts.
- `src/proxy.ts` (the Next.js 16 name for middleware) keeps the session fresh and sends anyone
  without one to `/login`. Pages get the household through `requireHousehold()`.
- Two Supabase clients on the server: `createSessionClient()` acts as the signed-in user and
  is bound by row level security; use it for all table access. `createAdminClient()` bypasses
  it and exists only for storage. Never use it for a table without checking access first.
- Every photo path a row names lies in its household's folder of the bucket
  (`private.in_household_folder`): the server signs and removes whatever path a row says,
  with the secret key, and a member can write those rows.

## Installed app (PWA)

- How it behaves like an installed app (no zoom, no bounce, upright) and the loading shapes and
  progress line: see [DESIGN.md](DESIGN.md#app-feel-and-loading).
- Installable: `app/manifest.ts`, icons drawn from the logo (`scripts/build-icons.ts`: the
  logo as it is, green to the edges for Android's mask and the iPhone), `appleWebApp` in
  the root layout. `src/proxy.ts` lets the manifest, `sw.js` and `offline.html` through
  without a login: the phone fetches the manifest without cookies.
- The installed app opens on the plate on the green: Android draws it from the manifest, an
  iPhone needs a picture of exactly its screen (`STARTUP_SCREENS` in
  `src/lib/startup-screens.ts`, drawn into `public/startup/` by `npm run icons:build`,
  named in `appleWebApp.startupImage`). Without one it opened on white.
- The app starts at `/woche` (`start_url`); the proxy sends a signed-in "/" there before any
  page is rendered. The redirect through the page "/" cost 250 to 850 ms on every start
  (October 2026). The service worker enables navigation preload: the page is asked for
  while the worker is still waking up.
- Outside the installed app, every page carries a hint above its content how to put the
  app on the home screen (`InstallHintCard`, `installHint`): Safari, known by `navigator.standalone`,
  is told where Teilen and "Zum Home-Bildschirm" are, Android gets its install prompt, and
  both say that the installed app asks for the login once more. It goes once used or put
  away (`installieren-weg` in the device's storage).

## Offline

- The shopping list must work offline in the shop: cached list, queued check-offs.
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
- Ticks and decisions in the shop (the queue in IndexedDB, the server's rule, offline use): see
  [SHOPPING.md](SHOPPING.md#ticks-and-decisions).
- Without a connection every other form is stopped before it is sent and a bar says so
  (`ConnectionGuard`); only forms marked `data-offline-ok` go. Import and settings say at
  the top that they need a connection (`NeedsConnection`), and the batch page carries on by
  itself once the connection is back. Signing out (`data-sign-out`) makes the login page
  forget the kept pages and the waiting ticks of the device.

## Live updates

- Supabase Realtime tells an open page that the household changed something
  (`LiveRefresh`). A table that should do so is added to the publication `supabase_realtime`
  in a migration, guarded, because the embedded Postgres of the tests has no such publication,
  and to `DAILY_TABLES` or `LIBRARY_TABLES` in `src/lib/live-refresh.ts`:
  `supabase/tests/realtime.test.ts` holds the two to each other. The plan, the notes and the
  Merkzettel are read again half a second after a change; recipes, tags, the catalog, the
  shops and the members, which an import writes by the hundred, after three seconds of
  quiet and at least every ten seconds while it goes on (`refreshAt`). A change within three
  seconds of the device's own form or tick (`OWN_CHANGE`, sent once the server has the
  ticks) waits until three seconds after it: in the shop, every tick read the whole notes
  again half a second later. The Realtime client is a quarter of a page's script and is
  loaded once the page is idle (October 2026).
- `LiveRefresh` in the layout listens for changes to the plan, the lists, the note, the goals
  and to recipes, and calls `router.refresh()`: the page is read again from the server, under
  the same rules as on a reload. It also does so when a page comes back into view after a
  change arrived meanwhile or after half a minute away (`readOnReturn`), not after a moment
  in another app. The pages under `/import` are left out. A message about a deleted row
  carries only its key and reaches every signed-in browser, whichever household: nothing but
  "something changed" is taken from it.

## Speed

- A tap answers from the browser's memory, not the server: a page took 0.4 to 1.3 seconds
  to come, and a week or a recipe opened in front of a guest took seconds (October 2026).
  The tabs, the week's arrows (plan and notes), every link to a recipe and the way back
  fetch their whole page as soon as they are on the screen (`prefetch` on the `Link`),
  kept for five minutes (`staleTimes.static`); a page seen is kept for two
  (`staleTimes.dynamic`). Measured on a production build: those taps went from 0.4 to 1.3
  seconds to 30 to 130ms. `router.refresh()` (LiveRefresh) and the answer to every form
  clear that memory, so a change of the household still shows at once. Prefetching runs in
  production only; the browser tests run on the dev server and do not see it.
- The loading shapes (`loading.tsx`) and the green progress line: see
  [DESIGN.md](DESIGN.md#app-feel-and-loading). Without a `loading.tsx` a dynamic route is not prefetched.
- What the layout and a page both need is read once per request (`cache` of React):
  the household (`requireHousehold`), the signed-in member (`loadSelf`) and the Merkzettel
  (`loadOwnRestock`). The layout awaits none of it: the Merkzettel's count and the initial
  stream in behind `Suspense` (a plain Merkzettel button and an empty circle until then),
  so the frame and the page's loading shape are the first bytes. Waiting for them, opening
  the app showed nothing until they were read (October 2026). A page starts what does not
  depend on its week before it finds the week (the library on `/woche`), and reads that do
  not depend on each other go side by side: a week's recipes and foods, the library's
  recipes, tags and links, and the earlier dm entries with everything else of the notes.
- The week plan and the filters are plain forms and links: a server action per button, the
  filter in the address. They work before any script has loaded and need no client state.
- Server actions of one browser tab run one after the other. Work that should run side by side
  (the import steps) goes through a route handler instead: `src/app/api/import/`.
- `/api/suche` hands the signed-in browser the library as a search index
  (`SearchIndex`: recipes, and per recipe which catalog ingredients it uses). The search
  field (`LiveSearch`) fetches it once per visit and searches it with the same pure
  `searchRecipes` the server uses, so a list unfolds with the first letter and changes with
  every further one. Sending the search still goes to the server and works without scripts.

## Code layout

- `src/domain/`: pure TypeScript. No imports from Next.js, React, Supabase, the Anthropic SDK
  or Node built-ins. ESLint enforces this. Tests sit next to the code as `*.test.ts`.
- `src/server/`: everything that talks to the database, storage or a model. `src/app/`:
  routes and UI. `src/lib/`: small helpers shared by server and browser code.
- `src/domain/library/`: the recipe library as data (`RecipeSummary`), its filter and the
  shelves of the browse page. `src/domain/recommend/`: the balance of a week and the
  suggestions. `src/server/library.ts` and `src/server/planning/week.ts` load and store what
  they work on.
- `supabase/migrations/`: schema. `supabase/seed/*.ts` is the single source for the catalog
  and seed recipes; `supabase/seed.sql` is generated from it.

## Routes

| Route                                      | What it is                                                                                                                                                                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/woche`                                   | The week plan, start page. `/woche/pdf?w=` the week as a note for the pinboard; `?t=extra` shows what the week needs outside its meals, `?frage=<date>.<meal>` the meal a suggestion was asked for, `?mehr=<date>.<meal>` the meal "Mehr kochen" is open under |
| `/woche/auswahl`                           | Choosing a recipe for a meal or for the extras                                                                                                                                                                                                                 |
| `/woche/lebensmittel`                      | What to buy for a meal without a recipe                                                                                                                                                                                                                        |
| `/woche/ziele`                             | The goals of a week                                                                                                                                                                                                                                            |
| `/woche/verlauf`                           | All weeks, month by month                                                                                                                                                                                                                                      |
| `/woche/statistik`                         | How the family eats and shops: `?zeit=woche\|monat\|jahr` with `&am=<monday\|yyyy-mm\|yyyy>`, `&bereich=einkauf` for the shopping                                                                                                                              |
| `/rezepte`                                 | Browse and search, called "Entdecken"; `?art=<category>` a category's tab                                                                                                                                                                                      |
| `/rezepte/regal`                           | The shelf of cookbooks; `?buch=` the open one, `&ausgabe=` an edition                                                                                                                                                                                          |
| `/rezepte/stapel`                          | The recipe stack; `?art=` one category                                                                                                                                                                                                                         |
| `/rezepte/zutaten`                         | "Was ist noch da?"; `?z=<food>` per food tapped                                                                                                                                                                                                                |
| `/rezepte/roulette`                        | `?k=<main>.<cuisine>.<effort>` the combination shown                                                                                                                                                                                                           |
| `/import/rezepte`                          | "Alle Rezepte", every recipe as a table to look after; it was the Regal under Rezepte until October 2026; `?stichworte=<id>` opens a row's tags, `?loeschen=<id>` asks before deleting                                                                         |
| `/rezepte/saison`                          | "Was hat gerade Saison?"; `?monat=1..12` another month, `?zutat=<key>` the recipes with one food                                                                                                                                                               |
| `/rezepte/stichworte`                      | The tags themselves; `?stichwort=<id>` opens one                                                                                                                                                                                                               |
| `/favoriten`                               | Favourites                                                                                                                                                                                                                                                     |
| `/rezepte/[id]`                            | A recipe; `?stichworte=bearbeiten` changes its tags in place, `?portionen=` how much is cooked                                                                                                                                                                 |
| `/rezepte/neu`                             | A recipe typed in, or with `?art=text` pasted as text                                                                                                                                                                                                          |
| `/rezepte/[id]/bearbeiten`                 | A recipe corrected by hand                                                                                                                                                                                                                                     |
| `/rezepte/hinzufuegen`                     | A recipe added: photo, pasted text or typed; `?d=<date>&m=<meal>` for a meal planned as text                                                                                                                                                                   |
| `/import/pruefen/angaben`                  | Assigned fields that do not fit; `?feld=` one of them                                                                                                                                                                                                          |
| `/import/pruefen/doppelt`                  | Duplicates; `?behalten=<id>&weg=<id>` asks before a merge                                                                                                                                                                                                      |
| `/import/pruefen/schritte`                 | Steps read with doubts                                                                                                                                                                                                                                         |
| `/einkauf`                                 | The shopping notes of a week as tiles; `?zettel=<date>.<place>` shows one of them picked up                                                                                                                                                                    |
| `/einkauf/pdf`                             | All notes, or with `zettel` one, as a PDF                                                                                                                                                                                                                      |
| `/merkzettel`                              | What ran out at home, as a page; the header pulls the same note down over any page                                                                                                                                                                             |
| `/einstellungen`                           | Settings                                                                                                                                                                                                                                                       |
| `/einstellungen/vorrat`                    | What is usually at home                                                                                                                                                                                                                                        |
| `/import`                                  | Import; `?d=<date>&m=<meal>` when it was opened from a meal planned as text                                                                                                                                                                                    |
| `/einladung/[token]`                       | Joining a household (outside the login)                                                                                                                                                                                                                        |
| `/passwort-vergessen`, `/auth/bestaetigen` | Outside the login; the latter is the link of its e-mail                                                                                                                                                                                                        |
| `/passwort-neu`, `/kein-haushalt`          | Need a login but no household                                                                                                                                                                                                                                  |

## Data access

- The API returns at most 1000 rows per request and cuts a longer answer off without saying
  so. Anything that can grow beyond that is read with `allRows` (`src/server/catalog.ts`):
  recipes, recipe tags, ingredient lines, import jobs, and the catalog itself. A table longer
  than a page is read four pages at a time (`readPages`), so its query needs a unique order:
  the ingredient lines of 880 recipes are eleven pages, and one after the other they kept
  the import page waiting for seconds. The catalog was read in one request until it had 1024
  ingredients; Zucker and Zwiebeln then did not exist for the app. `tests/paging.test.ts`
  scans the source for reads of growing tables that are neither narrowed nor paged.

## Tests

- `e2e/`: Playwright tests. `e2e/fixtures.ts` puts the test household into a known state
  without calling a model: a made-up cookbook of twenty recipes ("E2E Kochbuch", "Zweites
  Buch"). It exists only while tests run: `e2e/teardown.ts` empties the test household after
  every run. The real household's recipes are never used for tests.
- `supabase/tests/`: applies migrations and seed to an embedded Postgres and tests schema
  constraints and RLS. A new table must have `household_id`, RLS and a policy, or these fail.
  `isolation.test.ts` has a member of a second household try to read, change, delete, add
  and move rows of the first in every table; a new table needs a row in its fixture, or it
  fails.
- `tests/fixtures/sample-week/`: the handwritten plan, list and recipes, transcribed, plus
  `inputs.json` with what else the list depends on (free entries, at-home ticks, what is
  bought later, which recipes are still pending).
- `tests/acceptance/`: builds the list for that week with the real catalog and compares it
  with the handwritten one. `npm run sample-week` prints both.
