# Deployment

Essensplan runs on Vercel, next to one Supabase project in Frankfurt. The family uses the
production deployment at **https://familyessensplan.vercel.app**. Every other branch gets a
preview deployment that only the test household can sign in to.

## Overview

| Part           | Where                                                  | Notes                                                                 |
| -------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| App            | Vercel project, production branch `main`               | Functions run in `fra1` with Fluid compute (`vercel.json`)            |
| Database, Auth | Supabase project in eu-central-1 (Frankfurt), Pro plan | Row level security on every table; sign-ups off                       |
| Photos         | Supabase Storage, private bucket `recipe-photos`       | Read and written through signed URLs from the server                  |
| Recipe reading | Anthropic API, server side only                        | Model IDs from `ANTHROPIC_EXTRACT_MODEL` and `ANTHROPIC_VERIFY_MODEL` |
| Migrations     | Supabase GitHub integration                            | Applied when a pull request is merged into `main`                     |

### Hosting plan

- **Vercel Hobby** is enough for the family and for a private beta: it is for non-commercial
  use, and a donation or support link is allowed. Selling a subscription later needs
  **Vercel Pro**.
- Hobby gives a function at most 300 seconds, 2 GB and one CPU. Every long request stays
  inside that (see "Function limits").
- **Supabase Pro** keeps a daily backup of the database for 7 days. The Free plan keeps
  none: stay on Pro before any public beta. The backup does **not** include the photos in
  Storage (see "Backup and restore").

## Environment variables

Set under Vercel → Project → Settings → Environment Variables. Mark the secret ones as
**Sensitive**: Vercel then never shows them again.

| Name                                   | Production | Preview | Sensitive | What it is                                                                        |
| -------------------------------------- | :--------: | :-----: | :-------: | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             |     ✓      |    ✓    |           | Supabase → Project Settings → Data API                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |     ✓      |    ✓    |           | Supabase → API Keys, the publishable key (`sb_publishable_…`)                     |
| `SUPABASE_SECRET_KEY`                  |     ✓      |    ✓    |     ✓     | The secret key (`sb_secret_…`). Server only                                       |
| `ANTHROPIC_API_KEY`                    |     ✓      |    ✓    |     ✓     | platform.claude.com → API keys. Server only                                       |
| `ANTHROPIC_EXTRACT_MODEL`              |     ✓      |    ✓    |           | The reading model, e.g. `claude-haiku-5-5`                                        |
| `ANTHROPIC_VERIFY_MODEL`               |     ✓      |    ✓    |           | The checking model, e.g. `claude-haiku-5-5`                                       |
| `PREVIEW_ONLY_EMAIL`                   |            |    ✓    |           | The test household's login (`E2E_EMAIL`). Without it nobody signs in to a preview |

Only the two `NEXT_PUBLIC_` values reach the browser. A production build was searched for
the secret key, the Anthropic key and the test password: none of them is in `.next/static`.
To check again after a change: `npx next build`, then search `.next/static` for each value.

Set a monthly spend limit on the Anthropic key in its console. Reading costs about 0.4
cents per recipe, so a limit of a few euros covers whole cookbooks.

## Preview deployments

Previews use the same Supabase project as production, so they could change the real
household. Two things prevent that:

1. Vercel → Settings → Deployment Protection → **Standard Protection**: a preview opens only
   for members of the Vercel team.
2. The app itself (`src/lib/preview.ts`): when `VERCEL_ENV` is `preview`, the login refuses
   every address but `PREVIEW_ONLY_EMAIL`, the proxy signs anyone else out, and invitations
   are not taken. An account is only ever made in production, so every invitation link
   leads there.

## Supabase Auth

Supabase → Authentication → URL Configuration:

- **Site URL**: `https://familyessensplan.vercel.app`
- **Redirect URLs**, exactly these:
  - `https://familyessensplan.vercel.app/**`
  - `https://*-dazzlingdolphins-projects.vercel.app/**` (previews)
  - `http://localhost:3000/**` (development)

Supabase → Authentication → Sign In / Providers → Email:

- **Allow new users to sign up: off.** An account is made only by `acceptInvite` with the
  secret key, for someone holding an invitation link. Accounts made that way are confirmed
  already, so "Confirm email" may stay on.
- "Passwort vergessen" sends its e-mail through Supabase. Its own mail server writes only to
  the project's team and a few times an hour. For the family, set a mail server under
  Authentication → Emails → SMTP Settings, and change the "Reset password" template's link
  to the `token_hash` form (`{{ .SiteURL }}/auth/bestaetigen?token_hash={{ .TokenHash }}&type=recovery`),
  so that the link works on any device.

## Deploy

1. Work on a branch and open a pull request. Vercel builds a preview.
2. A migration the branch needs is applied before the merge, while it is additive:
   `npx supabase db push`. The old code keeps working with it, and the merge finds it
   applied. (On a merge Vercel and the GitHub integration run side by side; code that
   reads a column the database does not have yet would fail for that minute.)
3. Merge into `main`. Vercel builds and promotes production; Supabase applies migrations
   that are still missing.
4. Run the smoke test: `npm run e2e:production` (see below).

## Function limits

Hobby cuts a function off after 300 seconds. The long requests and what keeps them inside:

| Request                                        | Worst case                                                                        | What keeps it inside                                                                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One import step (`/api/import/[batchId]/step`) | Two or three model requests for one recipe                                        | One step per request, driven by the batch page; `maxDuration = 300`; each model request gives up after 90 s and is retried once only when the service is busy. A timeout answers "throttled" and the page carries on |
| Supermarket search (settings)                  | Nominatim, up to four Overpass servers, Wikidata, then a street lookup per market | One deadline of 240 s for all of it (`SEARCH_BUDGET_MS`). Streets still waiting are placed on the next search                                                                                                        |
| Recipe pasted as text                          | One reading and its tags                                                          | The same 90 s per model request                                                                                                                                                                                      |

## Rollback

- **Code**: Vercel → Deployments → the previous production deployment → **Instant
  Rollback**. On Hobby this is the deployment before the current one. Then fix forward:
  revert the commit on `main` (`git revert`), open a pull request, merge.
- **Database**: migrations only go forward. Undo one with a new migration. Because every
  migration is additive, rolling the code back never needs the database rolled back.

## Backup and restore

**Database.** Supabase Pro takes a backup every day and keeps 7 (Database → Backups).
To restore: choose a day and "Restore". The whole database goes back to that moment,
including Auth, and the project is unavailable for a few minutes. Ticks and plans made
after the backup are lost; tell the family first.

For a copy of your own, independent of Supabase (needs `pg_dump` 17, `brew install
postgresql@17`, and the session pooler's connection string from Connect → Session pooler):

```sh
pg_dump "$SESSION_POOLER_URL" --format=custom --no-owner --file essensplan-$(date +%F).dump
```

Restore it into an empty Supabase project with
`pg_restore --no-owner --dbname "$NEW_SESSION_POOLER_URL" essensplan-<date>.dump`.

**Photos.** Storage is not part of the database backup. The recipes do not need the photos
(ingredients and steps are stored as text), but the household would lose its page views.
Copy the bucket now and then:

```sh
npx supabase storage cp -r ss:///recipe-photos ./backup/recipe-photos --linked --experimental
```

and copy it back with source and destination swapped.

## Smoke test of production

`npm run e2e:production` runs `e2e/production.spec.ts` on the phone project against the
production URL, as the test household from `.env.local`. It signs in, checks the manifest
and the headers over HTTPS, plans a meal and finds it on its shopping note, ticks a line
with the connection off and sees the tick arrive once it is back, and compares every other
household's rows before and after: they must not change. The test household is emptied
again afterwards, as after every browser test run.

## Security

- Every table has row level security; `supabase/tests/isolation.test.ts` proves a member of
  one household cannot read or change another's rows.
- Accounts by invitation only; sign-ups are off in Supabase. Any member can make an
  invitation; only the admin removes members.
- Every response carries `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, HSTS, a `Permissions-Policy` and a
  `Content-Security-Policy` without frames, plugins or foreign form targets
  (`next.config.ts`). Scripts are not limited by the policy: the pages need Next.js's
  inline scripts.
- An invitation link that was used, withdrawn or is older than seven days says so and leads
  to the login.
