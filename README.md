# Essensplan

A meal planner and shopping list for one family of four. It replaces the handwritten weekly
meal plan on the fridge and the shopping lists written from it.

The family plans the week on the iPad at the weekend, shops with the iPhone, and cooks from
the cookbooks on the shelf. Planning a week and getting a correct list should take a few
minutes and be easier than pen and paper. The app is in German and runs at
https://familyessensplan.vercel.app, by invitation only.

## What it does

**Plan the week**

- Lunch and dinner for every day, plus coffee and cake on Sunday. A meal is one or more
  recipes, or something without one: leftovers, a cold supper with bread and cold cuts,
  eating out.
- Weekly goals for the family's balance (at least 3 vegetarian meals and 1 fish, at most 2
  each with poultry and red meat) and a count that shows how the week stands.
- Suggestions only when asked, each with its reasons: someone wants to cook it, it fits the
  season, it has not been cooked for a while, the week still lacks fish. Light dinners and
  quick meals on working days. "Plan vervollständigen" fills the open meals in one go.
- Cook extra portions for leftovers later in the week, and the week as a postcard-sized PDF
  for the pinboard.

**Shop**

- The shopping notes are worked out from the plan: amounts scaled to the family, converted
  and summed per ingredient, sorted by aisle.
- One note per errand: supermarket, market, butcher, bakery and drugstore, each on the
  family's own shopping days. Things go on the first errand from which they keep until the
  meal, so the week needs as few big shops as possible.
- Ticking works without a connection in the shop and syncs later. Lines can be bought in
  part, swapped for another product, moved to another day or shop, or marked as already at
  home.
- A "Merkzettel" for what ran out at home, which goes onto the next suitable note.
- Every note as a PDF the size of a notepad sheet.

**Recipes**

- Photograph cookbook pages and the recipes are read by a model (Claude Haiku), checked by a
  second pass, and filed in the library. Anything read with doubt waits for a person to
  check it. Recipes can also be pasted as text or typed in.
- Browse by category, season, effort, cuisine and main ingredient; a search that forgives
  typos; the cookbooks as a shelf; a recipe stack to swipe; "Was ist noch da?" to cook from
  what is left; favourites and wishes.
- A cooking view with the ingredients to tick off and the steps in large writing, scaled to
  the number of portions.

**Family**

- Everyone has their own account in one shared household. Changes appear live on the other
  devices.
- Installable on iPhone and Android as an app.
- Statistics on how the family eats and shops, by week, month and year.

## Built with

Next.js 16, TypeScript, Tailwind 4, Supabase (Postgres, Auth, Storage, Frankfurt), the
Anthropic API for reading recipes, hosted on Vercel.

## Development

```bash
npm install
cp .env.example .env.local   # Supabase keys and the Anthropic API key
npm run dev                  # http://localhost:3000
npm test                     # unit, schema and acceptance tests
```

- [CLAUDE.md](CLAUDE.md): all commands, the architecture, the design rules and the domain
  rules the app follows.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): setting up Supabase and Vercel, deploying,
  rollback and backups.
- [docs/FAMILIE.md](docs/FAMILIE.md): how a family member gets in (German).
