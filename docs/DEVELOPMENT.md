# Development

How changes are made, tested and merged, and the pitfalls of this machine and this project
that cost time before.

## Branches and pull requests

- `main` is production. Merging into it deploys the app to https://familyessensplan.vercel.app
  (Vercel) and applies new migrations to the Supabase project (GitHub integration).
- Every change starts as a branch from an up-to-date `main`:
  `feat/<topic>` for something new, `fix/<topic>` for a bug, `docs/<topic>`, `chore/<topic>`
  for tooling and dependencies. One branch per change, not per phase or per area.
- The branch becomes a pull request. Vercel builds a preview of it, which only the test
  household can sign in to (`src/lib/preview.ts`). The pull request says what changed for
  the family and how to test it by hand.
- Merge with a merge commit, so the small commits stay in the history. GitHub deletes the
  branch on merge ("Automatically delete head branches" is on). Delete the local branch too
  (`git branch -d`, or `git fetch --prune` and `git branch -vv` to find gone ones).
- Rarely more than two branches are open. A branch that waits for another is rebased onto
  `main` once the other is merged; branches are not stacked.
- Until November 2026 the work went in phases, one long branch each, stacked on the one
  before ([HISTORY.md](HISTORY.md)). That left 44 branches behind; they were deleted after
  their content was found in `main`.

## Migrations

- A migration needed to test a branch is applied earlier with `npx supabase db push`; the
  merge then finds it applied. Keep such migrations additive, so the code on `main` still
  works with them.
- After a migration, regenerate the types with `npm run db:types`.

## Testing

- Unit tests (`npm test`) run without a network: migrations, seed and RLS against an
  embedded Postgres (PGlite) in `supabase/tests/`.
- Browser tests (`npm run e2e`) run against the hosted project as the test household, on a
  dev server of their own (port 3100). With `npm run dev` already running, use
  `E2E_PORT=3000 npm run e2e`. `e2e/fixtures.ts` puts the test household into a known state
  without calling a model; `e2e/teardown.ts` empties it after every run.
- The config of the browser tests is `e2e/playwright.config.ts`, of the unit tests
  `tests/vitest.config.mts`; the npm scripts name them.
- A test that fails at a step that passed before, or a run that takes far longer than its
  tests add up to, is often the Mac asleep, not the app: compare `date` before and after and
  look at `pmset -g log | grep -E "Entering Sleep|Wake from"`. On battery with the lid
  closed it sleeps whatever `caffeinate` says; with the lid open `caffeinate -i` helps (a
  full run took 45 minutes with 8 failures asleep and 15 minutes under it, October 2026).
- A failure that moves from step to step across runs is the environment; one that stays at
  the same assertion is real. Under load (an import running beside it) about four tests
  failed at different places each time: rerun a failure by name with `--repeat-each 3`
  before calling it real.
- Some tests depend on the day: two failed only because the run was on a Sunday, or because
  the test user's name made the plan greet them. Read the assertion before suspecting sleep.
- To wait for a background test run, wait for a file the run writes when it ends. A loop on
  `pgrep -f "playwright test"` matches its own command line and never ends.

## Changing code while an import runs

The household runs recipe imports for hours on `npm run dev` in the project folder. Editing
files there hot-reloads the server mid-batch, and a half-edited state makes import steps fail
("Das Einlesen wurde unterbrochen"; the batch then waits for a click).

- Build in a separate `git worktree` outside the project folder, on a new branch from
  `origin/main`.
- Symlink `.env.local`, `samples` and `supabase/.temp` into it; add `samples` to
  `.git/info/exclude` (the `samples/` ignore rule does not match a symlink). Remove these
  links by hand before removing the worktree.
- `node_modules` must be a real install there (`npm ci`): unit tests and `tsc` work with a
  symlink, but Turbopack (`next dev`, so the browser tests) refuses it.
- Apply an additive migration with `npx supabase db push --yes` before switching.
- Switch the project folder to the new branch only when no batch is running (check the
  `import_job` statuses), then confirm with `E2E_PORT=3000 npm run e2e`.
- A change to how recipes are read is expected to reach the recipes already imported too,
  not only future imports (said for servings units, October 2026): plan a script for that.
