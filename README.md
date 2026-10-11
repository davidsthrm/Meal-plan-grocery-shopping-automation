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

Conventions, architecture and the domain rules are in [CLAUDE.md](CLAUDE.md).
