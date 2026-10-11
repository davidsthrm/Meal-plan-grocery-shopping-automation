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

| Task                                                            | Command                                   |
| --------------------------------------------------------------- | ----------------------------------------- |
| Dev server                                                      | `npm run dev`                             |
| Unit tests (domain, schema, acceptance)                         | `npm test`                                |
| One test file                                                   | `npx vitest run src/domain/units.test.ts` |
| Typecheck                                                       | `npm run typecheck`                       |
| Lint                                                            | `npm run lint`                            |
| Format                                                          | `npm run format`                          |
| Print the sample week list and compare with the handwritten one | `npm run sample-week`                     |
| Regenerate `supabase/seed.sql` from `supabase/seed/*.ts`        | `npm run seed:build`                      |

Docker is not required for tests. Migrations, seed and RLS run against an embedded Postgres
(PGlite) in `supabase/tests/`.

## Workflow

- Work in phases: 0 scaffold, 1 schema and domain logic, 2 recipe import, 3 auth and UI,
  4 recurring items, leftovers, at-home step, history, 5 recommendations, 6 deployment, PWA,
  export. One branch per phase, named `phase-N-topic`, stacked on the previous one. Small
  commits, one concern each.
- After each phase: stop, summarize, and say how to test it manually.
- Never commit secrets or anything from `samples/`. That folder holds private photos with GPS
  data and stays gitignored.
- No feature is done without tests for its domain logic.

## Stack and decisions

- Next.js 16 (App Router, TypeScript), Tailwind 4, installable as a PWA.
- Supabase in Frankfurt: Postgres, Auth, private Storage bucket, RLS on every table.
- Hosting on Vercel. Login with email and password, accounts by invite only, sign-up disabled.
- The shopping list must work offline in the shop: cached list, queued check-offs.
- Vitest for unit tests, Playwright for a few end-to-end flows.
- Recipe import uses the Anthropic API, server side only. Model IDs come from
  `ANTHROPIC_EXTRACT_MODEL` and `ANTHROPIC_VERIFY_MODEL`. Never hard-code a model ID.
- Photo uploads go from the browser straight to Storage. The server converts HEIC, applies the
  EXIF rotation, strips metadata (the photos carry GPS) and converts to sRGB.

## Architecture

- `src/domain/`: pure TypeScript. No imports from Next.js, React, Supabase, the Anthropic SDK
  or Node built-ins. ESLint enforces this. Tests sit next to the code as `*.test.ts`.
- `src/server/`: database access, import pipeline, PDF. `src/app/`: routes and UI.
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
- A quantity range ("2-3") counts with its upper bound for shopping.
- An alternative ingredient ("oder Petersilie") never reaches the list.
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

Import (phase 2)

- Never guess. An illegible or ambiguous value is null plus a flag.
- New catalog ingredients are proposed for batch confirmation, never created silently.

## Open items

- Recipes still to come from the household: Tomate Mozzarella, Pestonudeln, Leberkässalat,
  Garnelen-Salat mit Feldsalat, Schafskäseauflauf, Hawaiitoast, Apfelkuchen, and homemade
  Spätzle as a side. "Reste" and "Vesper" never have a recipe.
- Two seed recipes have no title because the facing page was not photographed (book pages 97
  and 88). They are seeded as "Ohne Titel" with status `needs_review`.
- The Anthropic API is billed separately from a Claude Pro subscription. An API key with
  prepaid credits is needed before phase 2 can run against real photos.
- Shelf life, pack sizes and default shops in the catalog are estimates. The household
  corrects them in the app once the settings UI exists.
