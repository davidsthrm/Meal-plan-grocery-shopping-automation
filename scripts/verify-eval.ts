import { existsSync, readFileSync } from "node:fs";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import type { ExpectedRecipe } from "@/domain/import/score";
import { flawless } from "@/domain/import/testing";
import type { Verification } from "@/domain/import/verification";
import { createAnthropicVerifier } from "@/server/import/anthropic-reader";
import { normalizeImage } from "@/server/import/normalize-image";
import fixtures from "../tests/fixtures/sample-week/recipes.json";

/**
 * Measures the second check pass: does it catch a mistake in a transcription, and does it
 * leave a correct transcription alone?
 *
 * For each sample recipe it checks the correct transcription and five copies with one planted
 * mistake each: a wrong amount, a wrong unit, a dropped line, an invented line, wrong servings.
 *
 *   npm run import:eval-verify                       model from ANTHROPIC_VERIFY_MODEL
 *   npm run import:eval-verify -- --model claude-sonnet-5-5
 *
 * Every run calls the API 30 times and costs money.
 */

const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-fable-5-1": [10, 50],
};

function argument(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const model = argument("model") ?? process.env.ANTHROPIC_VERIFY_MODEL ?? "";
const recipes = fixtures.recipes as (ExpectedRecipe & { photo: string })[];

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is missing in .env.local.");
  process.exit(1);
}
if (!model) {
  console.error("No model given. Set ANTHROPIC_VERIFY_MODEL in .env.local or pass --model <id>.");
  process.exit(1);
}
if (recipes.some((r) => !existsSync(r.photo))) {
  console.error("Sample photos not found in samples/recipes/.");
  process.exit(1);
}

type Problems = Verification["problems"];

interface Case {
  name: string;
  recipe: ExtractedRecipe;
  /** Whether the reported problems include the planted mistake. Null for the correct copy. */
  caught: ((problems: Problems) => boolean) | null;
}

const copy = (recipe: ExtractedRecipe): ExtractedRecipe => structuredClone(recipe);

/** A different, still believable amount: another fraction, or the next number. */
function nearMiss(quantity: number): number {
  const whole = Math.floor(quantity);
  const fraction = quantity - whole;
  if (fraction > 0) return whole + (fraction === 0.5 ? 0.25 : 0.5);
  return quantity < 10 ? quantity + 1 : quantity + 50;
}

function cases(correct: ExtractedRecipe): Case[] {
  const list: Case[] = [{ name: "correct transcription", recipe: correct, caught: null }];
  const lines = correct.ingredients;

  // A fraction if the recipe has one: those are the amounts most easily misread.
  const amountAt = Math.max(
    lines.findIndex((l) => l.quantity !== null && !Number.isInteger(l.quantity)),
    lines.findIndex((l) => l.quantity !== null),
  );
  const wrongAmount = copy(correct);
  wrongAmount.ingredients[amountAt].quantity = nearMiss(lines[amountAt].quantity as number);
  list.push({
    name: `wrong amount: ${lines[amountAt].name} ${lines[amountAt].quantity} -> ${wrongAmount.ingredients[amountAt].quantity}`,
    recipe: wrongAmount,
    caught: (problems) => problems.some((p) => p.ingredientIndex === amountAt),
  });

  const unitAt = lines.findIndex((l) => l.unit === "EL" || l.unit === "TL");
  if (unitAt !== -1) {
    const wrongUnit = copy(correct);
    wrongUnit.ingredients[unitAt].unit = lines[unitAt].unit === "EL" ? "TL" : "EL";
    list.push({
      name: `wrong unit: ${lines[unitAt].name} ${lines[unitAt].unit} -> ${wrongUnit.ingredients[unitAt].unit}`,
      recipe: wrongUnit,
      caught: (problems) => problems.some((p) => p.ingredientIndex === unitAt),
    });
  }

  // Drop a line from the middle that no alternative depends on.
  const dropAt = lines.findIndex(
    (l, i) =>
      i >= Math.floor(lines.length / 2) &&
      l.alternativeTo === null &&
      !lines.some((o) => o.alternativeTo === i),
  );
  const dropped = copy(correct);
  dropped.ingredients.splice(dropAt, 1);
  for (const line of dropped.ingredients) {
    if (line.alternativeTo !== null && line.alternativeTo > dropAt) line.alternativeTo -= 1;
  }
  list.push({
    name: `dropped line: ${lines[dropAt].name}`,
    recipe: dropped,
    caught: (problems) => problems.some((p) => p.field === "missing_line"),
  });

  const invented = copy(correct);
  invented.ingredients.push({
    ...lines[0],
    raw: "1 TL Zucker",
    quantity: 1,
    quantityMax: null,
    unit: "TL",
    name: "Zucker",
    note: "",
    secondaryQuantity: null,
    secondaryUnit: null,
    secondaryScope: "none",
    alternativeTo: null,
  });
  list.push({
    name: "invented line: 1 TL Zucker",
    recipe: invented,
    caught: (problems) =>
      problems.some((p) => p.ingredientIndex === lines.length || p.field === "extra_line"),
  });

  const servings = copy(correct);
  servings.servingsMin = (correct.servingsMin as number) + 2;
  servings.servingsMax = (correct.servingsMax as number) + 2;
  list.push({
    name: `wrong servings: ${correct.servingsMin} -> ${servings.servingsMin}`,
    recipe: servings,
    caught: (problems) => problems.some((p) => p.field === "servings"),
  });
  return list;
}

async function main() {
  const verify = createAnthropicVerifier({ model });
  let planted = 0;
  let caught = 0;
  let falseAlarms = 0;
  let cleanPassed = 0;
  let cost = 0;
  let calls = 0;

  console.log(`\nSecond check pass with ${model}`);
  console.log("-".repeat(72));
  for (const expected of recipes) {
    const images = [await normalizeImage(readFileSync(expected.photo))];
    console.log(expected.id);
    for (const test of cases(flawless(expected))) {
      const { verification, usage } = await verify(images, test.recipe);
      const price = PRICES[model];
      if (price) cost += (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1e6;
      calls++;
      const problems = verification.problems;
      const describe = (p: Problems[number]) =>
        `[${p.ingredientIndex ?? "-"}] ${p.field}: printed "${p.printed}", transcribed "${p.transcribed}"`;

      if (test.caught === null) {
        if (problems.length === 0) cleanPassed++;
        falseAlarms += problems.length;
        console.log(`  ${problems.length === 0 ? "ok          " : "FALSE ALARM "} ${test.name}`);
        for (const p of problems) console.log(`      ${describe(p)}`);
        continue;
      }
      planted++;
      const found = test.caught(problems);
      if (found) caught++;
      // More than the one planted mistake reported: the rest are false alarms.
      const extra = Math.max(0, problems.length - 1);
      falseAlarms += found ? extra : problems.length;
      console.log(
        `  ${found ? "caught      " : "MISSED      "} ${test.name}${extra > 0 ? `  (+${extra} other)` : ""}`,
      );
      if (!found || extra > 0) for (const p of problems) console.log(`      ${describe(p)}`);
    }
  }
  console.log(
    `\n=> ${caught} of ${planted} planted mistakes caught, ` +
      `${cleanPassed} of ${recipes.length} correct transcriptions left alone, ${falseAlarms} false alarms, ` +
      `${((cost / calls) * 100).toFixed(2)} ct per check.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
