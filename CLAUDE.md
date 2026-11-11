# Essensplan

Family meal planner and grocery list for one household of four, used mostly on phones and
tablets. It replaces a handwritten weekly meal plan and the shopping list written from it.
Success means: planning a week and getting a correct, printable list takes a few minutes and
is easier than pen and paper. Live for the family at https://familyessensplan.vercel.app
since 19 October 2026.

## Where to find what

Read the doc of a topic before changing it. Each rule there has a reason, often a day the
family ran into it; keep the reason when you change the rule. Each rule lives in one doc
only; another doc that needs it links to it.

| File                                         | What it holds                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| [docs/STATUS.md](docs/STATUS.md)             | Where the app stands, known bugs, next steps, ideas, things to check by hand    |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, hosting, security, offline and ticks, live updates, speed, code, routes  |
| [docs/DESIGN.md](docs/DESIGN.md)             | Look, controls, motion, how design work is done, which design skill to use      |
| [docs/PLANNING.md](docs/PLANNING.md)         | Household and family, the week plan, suggestions, wishes, leftovers, statistics |
| [docs/RECIPES.md](docs/RECIPES.md)           | Units, scaling, steps, tags, search and filters, the library and its pages      |
| [docs/SHOPPING.md](docs/SHOPPING.md)         | Shopping notes, errands, supermarkets, Merkzettel, dm, PDF, acceptance test     |
| [docs/IMPORT.md](docs/IMPORT.md)             | Reading recipes from photos and text with the models, review, measurements      |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)   | Branches and pull requests, testing pitfalls, working while an import runs      |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)     | Vercel and Supabase setup, variables, limits, rollback, backups                 |
| [docs/HISTORY.md](docs/HISTORY.md)           | What each phase built, October 2026 on                                          |
| [docs/FAMILIE.md](docs/FAMILIE.md)           | The guide for the family, in German                                             |

## Commands

| Task                                                                      | Command                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------- |
| Dev server                                                                | `npm run dev`                                   |
| Unit tests (domain, schema, acceptance)                                   | `npm test`                                      |
| One test file                                                             | `npm test -- src/domain/units.test.ts`          |
| Typecheck                                                                 | `npm run typecheck`                             |
| Lint                                                                      | `npm run lint`                                  |
| Format                                                                    | `npm run format`                                |
| Print the sample week list and compare with the handwritten one           | `npm run sample-week`                           |
| Regenerate `supabase/seed.sql` from `supabase/seed/*.ts`                  | `npm run seed:build`                            |
| Check the Supabase project in `.env.local`                                | `npm run db:check`                              |
| Measure a model on the five sample recipe photos (calls the API)          | `npm run import:eval`                           |
| Measure the second check pass with planted mistakes (calls the API)       | `npm run import:eval-verify`                    |
| Run the complete import on photos without touching the database           | `npm run import:photo -- <photo> --book "..."`  |
| The same for the five sample recipes                                      | `npm run import:photo -- --samples`             |
| Browser tests against the separate test household (free)                  | `npm run e2e`                                   |
| The same while `npm run dev` is already running                           | `E2E_PORT=3000 npm run e2e`                     |
| Browser test of the shop without a connection (builds for production)     | `npm run e2e:offline`                           |
| Smoke test of production, as the test household                           | `npm run e2e:production`                        |
| Create or remove that test household and its login                        | `npm run e2e:setup`, `npm run e2e:teardown`     |
| Browser test of a real upload with the models (about 2 ct)                | `npm run e2e:upload`                            |
| Screenshots of every screen, phone, iPad (both ways) and desktop          | `npm run e2e:look`                              |
| A whole batch import from the command line, as the test user              | `npm run e2e:batch -- <photos>`                 |
| Redraw the home screen icons from `src/app/icon.svg`                      | `npm run icons:build`                           |
| Give already imported recipes the servings unit their photo prints        | `npm run import:servings-units -- "<name>"`     |
| Tags of "Hauptzutat" from the ingredients (dry run, then `--apply`)       | `npm run library:main-ingredients -- "<name>"`  |
| Describe recipes with tags: effort, dish, cuisine, season (calls the API) | `npm run import:tag-recipes -- "<name>"`        |
| Describe recipes that have no tag but their effort (calls the API)        | `npm run import:tag-recipes -- "<name>" --more` |
| Turn stored page photos upright and cut out each recipe (calls the API)   | `npm run import:frame-photos -- "<name>"`       |
| Measure whether pages laid on any side come back upright (calls the API)  | `npm run import:eval-frame`                     |
| Measure reading steps alone on the five sample photos (calls the API)     | `npm run import:eval-steps`                     |
| Steps for imported recipes: dry run with the cost, then per cookbook      | `npm run import:fill-steps -- "<name>"`         |
| Look for the supermarkets near a postal code, step by step (no database)  | `npm run supermarkets:search -- 88471`          |
| Regenerate the database types after a migration                           | `npm run db:types`                              |
| Apply new migrations to the linked Supabase project                       | `npx supabase db push`                          |

Docker is not required for tests. Migrations, seed and RLS run against an embedded Postgres
(PGlite) in `supabase/tests/`. There is no local Supabase (Docker does not start on this
machine): development and browser tests run against the hosted project, in a separate test
household.

## How we work

- `main` is what the family runs: merging into it deploys the app (Vercel) and the
  migrations (Supabase's GitHub integration). Every change is a short-lived branch from
  `main`, named by kind and topic (`feat/recipe-roulette`, `fix/butcher-day`,
  `docs/status`, `chore/deps`), opened as a pull request and merged with a merge commit, so
  the small commits stay readable. GitHub deletes the branch on merge. Rarely more than two
  branches are open; one that waits is rebased on `main`, not stacked. Details in
  [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Small commits, one concern each, English messages that say what changed for the family.
- A migration needed to test a branch is applied earlier with `npx supabase db push`; the
  merge then finds it applied. Keep such migrations additive.
- A change is done when: its domain logic has tests; `npm test`, `npm run typecheck`,
  `npm run lint` and `npm run format:check` pass; `npm run e2e` passes when pages changed; a
  change of the look was checked in the running app (fetched stylesheet or screenshot,
  passing tests do not show a missing style); the topic doc and
  [docs/STATUS.md](docs/STATUS.md) say what is now true, in the same pull request. Then stop,
  summarize, and say how to test it by hand.
- Ask before doing what was not asked. Say what is unclear instead of guessing.
- Conventions, and anything where two topics disagree or a rule could be read two ways, are
  decided with David: ask, with a recommendation, instead of settling it alone. A question
  that has to wait goes under "Questions for David" in [docs/STATUS.md](docs/STATUS.md); the
  answer goes into the doc it belongs to.

## Rules that always hold

- Never write test data into the real household. Tests use the test household "E2E-Test
  (automatisch)", which row level security keeps apart.
- Never commit secrets or anything from `samples/` (private photos with GPS data).
- Run browser tests through `npm run e2e`, never `npx playwright test`: only the script
  leaves out the paid upload test. Name a file by its path (`npm run e2e --
e2e/list.spec.ts`); a bare word such as "plan" matches the project folder and runs every
  test.
- UI text is German, written directly in the components (no strings file). Code, comments,
  commit messages and docs are English. German words stay German where they are data:
  ingredients, units (EL, TL, Stück, Bund), shops, aisle groups.
- `src/domain/` is pure TypeScript: no Next.js, React, Supabase, Anthropic SDK or Node
  built-ins (ESLint enforces it). Tests sit next to the code as `*.test.ts`.
- Table access goes through `createSessionClient()` (bound by row level security).
  `createAdminClient()` is for storage only; never for a table without checking access first.
- Every new table has `household_id`, RLS, a policy, explicit grants to `authenticated` and
  `service_role`, no grant to `anon`, and a row in the fixture of
  `supabase/tests/isolation.test.ts`.
- Anything that can grow beyond 1000 rows is read with `allRows` (`src/server/catalog.ts`);
  `tests/paging.test.ts` checks it.
- Model IDs come from `ANTHROPIC_EXTRACT_MODEL` and `ANTHROPIC_VERIFY_MODEL`, never hard-coded.
  At most 2 cents per recipe for both passes. Details in [docs/IMPORT.md](docs/IMPORT.md).

## Next.js 16

This version has breaking changes: APIs, conventions and file structure may differ from what
you know (`proxy.ts` instead of middleware, async `params`, `PageProps<"/route">`). Read the
relevant guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation
notices. (`next dev` no longer writes this into an AGENTS.md: `agentRules: false` in
`next.config.ts`.)

## How to code (after Andrej Karpathy)

1. **Think before coding.** State assumptions. If there are several readings, name them
   instead of picking one silently. If something simpler would do, say so.
2. **Simplicity first.** The least code that solves the problem: no speculative features,
   no abstraction for one use, no options nobody asked for, no handling of impossible cases.
3. **Surgical changes.** Touch only what the task needs and match the style around it.
   Remove what your change made unused; mention other dead code, do not delete it unasked.
4. **Goal-driven.** Turn the task into checks: a failing test first for a bug, tests passing
   before and after a refactor. For several steps, name each step and how it is verified.

The full text is the `karpathy-guidelines` skill. Design work follows
[docs/DESIGN.md](docs/DESIGN.md), which says which of the design skills in `.claude/skills/`
to use for what (Emil Kowalski's animation skills, `apple-design`, `mobile-native`, …).

## Subagents and models

Use subagents where parts of a task are independent, and the cheapest model that keeps the
quality. The agents are defined in `.claude/agents/`:

| Agent         | Model       | For                                                                       |
| ------------- | ----------- | ------------------------------------------------------------------------- |
| `scout`       | Haiku       | Finding code and answering "where is …, what calls …" (read only)         |
| `test-runner` | Haiku       | Running tests and reporting failures, telling a flake from a real failure |
| `builder`     | Sonnet      | A change that is already specified: code and its tests, in one area       |
| `reviewer`    | Sonnet      | Reviewing a diff against these docs before it is merged                   |
| main session  | (as chosen) | Planning, design decisions, anything the household has to decide, merging |

- Fan out only where the parts touch different files; give each agent its files and a clear
  report to send back. The lead checks once at the end: tests, typecheck, lint, the look.
- An agent's report is input, not proof: verify what it claims before passing it on.
- Anything that calls the Anthropic API costs money: no agent runs it without being asked.
