# Essensplan

Family meal planner and grocery list. It replaces the handwritten weekly meal plan and the
shopping list written from it.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in once Supabase and the API key exist
npm run dev                  # http://localhost:3000
```

## Checks

```bash
npm test          # unit, schema and acceptance tests (no Docker needed)
npm run typecheck
npm run lint
```

## Supabase

One-time setup of the hosted project (region Central EU, Frankfurt):

```bash
npx supabase login
npx supabase link --project-ref <project-ref>      # asks for the database password
npx supabase db push --include-seed --dry-run      # preview
npx supabase db push --include-seed                # schema, catalog and seed recipes
```

In the dashboard, turn off "Allow new users to sign up", create your user, then give that
user access to the household in the SQL editor:

```sql
insert into public.household_member (household_id, user_id, role)
select h.id, u.id, 'admin'
from public.household h, auth.users u
where u.email = 'you@example.com'
returning household_id, user_id, role;
```

The statement must return one row. No row means the email does not match the user you created.

Put the project URL, the publishable key and the secret key into `.env.local`, then:

```bash
npm run db:check
```

Later schema changes are applied with `npx supabase db push` (without `--include-seed`).

Conventions, architecture and the domain rules are in [CLAUDE.md](CLAUDE.md).
