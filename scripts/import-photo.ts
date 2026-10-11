import { existsSync, readFileSync } from "node:fs";
import { createCatalogIndex } from "@/domain/catalog";
import type { ProvidedMetadata } from "@/domain/import/draft";
import { unmappedNames } from "@/domain/import/proposal";
import { formatAmount } from "@/domain/shopping-list/format";
import {
  createAnthropicReader,
  createAnthropicSuggester,
  createAnthropicVerifier,
} from "@/server/import/anthropic-reader";
import { importRecipe, type ImportResult } from "@/server/import/import-recipe";
import { seedCatalog } from "../supabase/seed/catalog";
import { seedRecipes } from "../supabase/seed/recipes";
import fixtures from "../tests/fixtures/sample-week/recipes.json";

/**
 * Runs the complete import on recipe photos and prints what the app would do with them.
 * Nothing is written to the database.
 *
 *   npm run import:photo -- path/to/photo.heic --book "Speed Cooking" --title "..." --page 12
 *   npm run import:photo -- page1.jpg page2.jpg            several photos of one recipe
 *   npm run import:photo -- --samples                      the five sample recipes
 *
 * Every recipe calls the API twice (reading and checking) and costs money.
 */

/** US dollars per million tokens, input and output, as of October 2026. For estimates only. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-fable-5-1": [10, 50],
};

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
}
const OPTIONS_WITH_VALUE = ["title", "book", "page"];
const files = args.filter(
  (arg, i) => !arg.startsWith("--") && !OPTIONS_WITH_VALUE.includes(args[i - 1]?.slice(2)),
);

const readModel = process.env.ANTHROPIC_EXTRACT_MODEL ?? "";
const verifyModel = process.env.ANTHROPIC_VERIFY_MODEL ?? "";
if (!process.env.ANTHROPIC_API_KEY || !readModel || !verifyModel) {
  console.error(
    "ANTHROPIC_API_KEY, ANTHROPIC_EXTRACT_MODEL and ANTHROPIC_VERIFY_MODEL must be set in .env.local.",
  );
  process.exit(1);
}

const index = createCatalogIndex(seedCatalog);
const deps = {
  read: createAnthropicReader({ model: readModel }),
  verify: createAnthropicVerifier({ model: verifyModel }),
  index,
};
const suggest = createAnthropicSuggester({ model: readModel });

function cents(result: ImportResult): string {
  // Both passes are priced with the reading model's rates; exact when both models are the same.
  const price = PRICES[readModel];
  if (!price) return "price unknown";
  const dollars =
    (result.usage.inputTokens * price[0] + result.usage.outputTokens * price[1]) / 1e6;
  return `${(dollars * 100).toFixed(2)} ct`;
}

async function show(label: string, result: ImportResult) {
  const { draft } = result;
  console.log(`\n${label}`);
  console.log("-".repeat(72));
  console.log(`Status: ${result.status.toUpperCase()}   (${cents(result)} for both passes)`);
  if (!draft) {
    for (const issue of result.issues) console.log(`  ${issue.code}: ${issue.detail}`);
    return;
  }
  const servings = draft.servings
    ? draft.servings.min === draft.servings.max
      ? `${draft.servings.min}`
      : `${draft.servings.min}-${draft.servings.max}`
    : "?";
  console.log(`Titel:     ${draft.title ?? "(fehlt)"}`);
  console.log(
    `Quelle:    ${draft.sourceBook ?? "(kein Buch angegeben)"}, Seite ${draft.sourcePage ?? "?"}`,
  );
  console.log(
    `Portionen: ${servings}   Zeit: ${draft.prepMinutes ?? "?"} Min.   ${draft.dishType}, ${draft.proteinType}`,
  );
  console.log("Zutaten:");
  draft.ingredients.forEach((line, at) => {
    const amount =
      line.quantity !== null && line.unit !== null
        ? formatAmount({ quantity: line.quantity, unit: line.unit }) +
          (line.quantityMax !== null ? ` (bis ${line.quantityMax})` : "")
        : "";
    const catalog = line.ingredientId
      ? index.ingredientById.get(line.ingredientId)!.name
      : "NICHT IM KATALOG";
    const extras = [
      line.alternativeTo !== null ? `Alternative zu Zeile ${line.alternativeTo}` : null,
      line.optional ? "optional" : null,
      line.approximate ? "ungefähr" : null,
    ].filter(Boolean);
    console.log(
      `  ${String(at).padStart(2)}  ${amount.padEnd(18)} ${catalog.padEnd(26)} ${line.originalText}` +
        (extras.length > 0 ? `   [${extras.join(", ")}]` : ""),
    );
  });
  if (result.issues.length > 0) {
    console.log("Zu prüfen:");
    for (const issue of result.issues) {
      console.log(
        `  ${issue.code}${issue.ingredientIndex !== null ? ` (Zeile ${issue.ingredientIndex})` : ""}: ${issue.detail}`,
      );
    }
  }
  for (const note of result.notes) console.log(`Hinweis: ${note}`);

  const unknown = unmappedNames(draft);
  if (unknown.length > 0) {
    console.log("Vorschläge für den Katalog:");
    for (const p of await suggest(unknown, index)) {
      const same = p.sameAsIngredientId
        ? `anderer Name für "${index.ingredientById.get(p.sameAsIngredientId)!.name}"`
        : `neu: ${index.aisleGroupById.get(p.aisleGroupId)!.name}, ${index.shopById.get(p.preferredShopId)!.shortLabel}`;
      console.log(`  ${p.name}: ${same}`);
    }
  }
}

async function runSamples(): Promise<boolean> {
  type Sample = {
    id: string;
    photo: string;
    providedByHousehold?: { title: string; book: string };
  };
  let allGood = true;
  for (const sample of fixtures.recipes as Sample[]) {
    if (!existsSync(sample.photo)) {
      console.error(`Sample photo not found: ${sample.photo}`);
      return false;
    }
    const provided: ProvidedMetadata = sample.providedByHousehold ?? {};
    const result = await importRecipe([readFileSync(sample.photo)], provided, deps);
    await show(
      `${sample.id}${sample.providedByHousehold ? "  (title and cookbook entered by hand)" : ""}`,
      result,
    );

    // The import should arrive at the same catalog mapping as the hand-mapped seed recipe.
    const seed = seedRecipes.find((r) => r.sampleId === sample.id)!;
    const got =
      result.draft?.ingredients.map((l) => `${l.ingredientId} ${l.quantity} ${l.unit}`) ?? [];
    const want = seed.ingredients.map((l) => `${l.ingredientId} ${l.quantity} ${l.unit}`);
    const same = got.join("|") === want.join("|");
    console.log(`Same ingredients as the hand-mapped recipe: ${same ? "yes" : "NO"}`);
    if (!same || result.status !== "approved") allGood = false;
  }
  return allGood;
}

async function main() {
  if (args.includes("--samples")) {
    const ok = await runSamples();
    console.log(
      `\n${ok ? "All five samples were approved automatically and match." : "Not all samples came through cleanly."}`,
    );
    process.exit(ok ? 0 : 1);
  }
  if (files.length === 0) {
    console.error("Give at least one photo, or --samples. See the top of scripts/import-photo.ts.");
    process.exit(1);
  }
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length > 0) {
    console.error(`Not found: ${missing.join(", ")}`);
    process.exit(1);
  }
  const page = option("page");
  const provided: ProvidedMetadata = {
    title: option("title"),
    book: option("book"),
    page: page ? Number(page) : null,
  };
  await show(
    files.join(" + "),
    await importRecipe(
      files.map((file) => readFileSync(file)),
      provided,
      deps,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
