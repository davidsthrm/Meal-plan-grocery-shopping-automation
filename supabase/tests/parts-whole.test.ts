import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "./database";

/**
 * The migration that makes parts the whole fills every household's catalog by name. It runs
 * here on two households made before it, as on the hosted project.
 */

const MIGRATION = "20261122000100_parts_whole.sql";
const HOME = "44444444-4444-4444-8444-444444444444";
const NEIGHBOURS = "55555555-5555-4555-8555-555555555555";

let db: PGlite;

async function household(id: string, ingredients: [string, string, string[]?][]) {
  await db.query("insert into public.household (id, name) values ($1, $2)", [id, "Haus"]);
  const shop = await db.query<{ id: string }>(
    "insert into public.shop (household_id, name, short_label, sort_order, is_default) values ($1, 'Aldi', 'Aldi', 1, true) returning id",
    [id],
  );
  const aisle = await db.query<{ id: string }>(
    "insert into public.aisle_group (household_id, name, sort_order) values ($1, 'Obst', 1) returning id",
    [id],
  );
  for (const [name, unit, synonyms = []] of ingredients) {
    await db.query(
      `insert into public.ingredient (household_id, name, synonyms, aisle_group_id, preferred_shop_id, default_unit)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, name, synonyms, aisle.rows[0].id, shop.rows[0].id, unit],
    );
  }
}

beforeAll(async () => {
  db = await createDatabase({ before: MIGRATION });
  await household(HOME, [
    ["Knoblauch", "Zehe", ["Knoblauchzehe"]],
    ["Thymian", "Bund"],
    ["Blattpetersilie", "Bund", ["Petersilie"]],
    // Kept by the leaf: a bunch would not add up with its leaves.
    ["Salbei", "Blatt"],
    ["Frühlingszwiebeln", "Bund", ["Lauchzwiebeln"]],
    ["Radieschen", "Bund"],
    ["Zitronen", "Stück", ["Zitrone"]],
    ["Bio-Zitronenschale", "TL", ["Zitronenschale"]],
    ["Schale von 1 Zitrone", "Stück"],
    ["Limetten", "Stück", ["Limette"]],
    ["Limettenschale", "TL"],
    ["Orangen", "Stück", ["Orange"]],
    ["Orangenschale", "TL"],
    ["Zitronensaft", "ml"],
    ["Limettensaft", "EL"],
    ["Orangensaft", "ml"],
  ]);
  await household(NEIGHBOURS, [
    ["Zitronen", "Stück"],
    ["Zitronenschale", "TL"],
  ]);
  await db.exec(
    readFileSync(fileURLToPath(new URL(`../migrations/${MIGRATION}`, import.meta.url)), "utf8"),
  );
});

async function catalog(household: string) {
  const result = await db.query<{
    name: string;
    whole_unit: string | null;
    per_whole: object;
    whole: string | null;
    staple: boolean;
  }>(
    `select i.name, i.whole_unit, i.per_whole, f.name as whole, i.is_pantry_staple as staple
     from public.ingredient i
     left join public.ingredient f on f.household_id = i.household_id and f.id = i.whole_ingredient_id
     where i.household_id = $1`,
    [household],
  );
  return Object.fromEntries(result.rows.map(({ name, ...row }) => [name, row]));
}

describe("parts become the whole", () => {
  it("buys garlic by the bulb, herbs, spring onions and radishes by the bunch", async () => {
    const home = await catalog(HOME);
    expect(home["Knoblauch"]).toMatchObject({ whole_unit: "Knolle", per_whole: { Zehe: 10 } });
    const sprigs = { whole_unit: "Bund", per_whole: { Zweig: 10, Stängel: 10 } };
    expect(home["Thymian"]).toMatchObject(sprigs);
    expect(home["Blattpetersilie"]).toMatchObject(sprigs);
    expect(home["Salbei"]).toMatchObject({ whole_unit: null, per_whole: {} });
    expect(home["Frühlingszwiebeln"]).toMatchObject({
      whole_unit: "Bund",
      per_whole: { Stück: 7 },
    });
    expect(home["Radieschen"]).toMatchObject({ whole_unit: "Bund", per_whole: { Stück: 12 } });
  });

  it("buys zest as the household's own fruit", async () => {
    const home = await catalog(HOME);
    const lemon = { whole: "Zitronen", per_whole: { TL: 3, Stück: 1 } };
    expect(home["Bio-Zitronenschale"]).toMatchObject(lemon);
    expect(home["Schale von 1 Zitrone"]).toMatchObject(lemon);
    expect(home["Limettenschale"]).toMatchObject({ whole: "Limetten", per_whole: { TL: 2 } });
    expect(home["Orangenschale"]).toMatchObject({ whole: "Orangen", per_whole: { EL: 1 } });
    expect((await catalog(NEIGHBOURS))["Zitronenschale"]).toMatchObject(lemon);
  });

  it("has lemon and lime juice at home, not orange juice", async () => {
    const home = await catalog(HOME);
    expect(home["Zitronensaft"].staple).toBe(true);
    expect(home["Limettensaft"].staple).toBe(true);
    expect(home["Orangensaft"].staple).toBe(false);
    expect(home["Zitronen"]).toMatchObject({ staple: false, whole: null, per_whole: {} });
  });
});
