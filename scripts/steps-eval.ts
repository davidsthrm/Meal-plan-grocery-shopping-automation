import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { scoreSteps, stepScoreLines, type ExpectedRecipe } from "@/domain/import/score";
import { settleSteps } from "@/domain/import/steps";
import {
  createAnthropicStepsReader,
  createAnthropicStepsVerifier,
} from "@/server/import/anthropic-reader";
import { normalizeImage } from "@/server/import/normalize-image";
import { RecipeReadError } from "@/server/import/read-recipe";
import fixtures from "../tests/fixtures/sample-week/recipes.json";

/**
 * Measures the reading of steps alone, as `npm run import:fill-steps` does it for recipes in
 * the library: both requests, on the five sample photos at the size they are stored at, scored
 * against the steps transcribed by hand. Also says what each recipe would be stored with.
 *
 *   npm run import:eval-steps                          models from .env.local
 *   npm run import:eval-steps -- --runs 3              repeat, to see how stable it is
 *
 * Every run calls the API ten times and costs about 3 ct.
 */

const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-fable-5-1": [10, 50],
};

const at = process.argv.indexOf("--runs");
const repetitions = at === -1 ? 1 : Number(process.argv[at + 1]) || 1;
const readModel = process.env.ANTHROPIC_EXTRACT_MODEL ?? "";
const verifyModel = process.env.ANTHROPIC_VERIFY_MODEL ?? "";
const recipes = fixtures.recipes as (ExpectedRecipe & { photo: string })[];

if (!process.env.ANTHROPIC_API_KEY || !readModel || !verifyModel) {
  console.error("ANTHROPIC_API_KEY and both model settings must be set in .env.local.");
  process.exit(1);
}
if (recipes.some((r) => !existsSync(r.photo))) {
  console.error("Sample photos not found in samples/recipes/.");
  process.exit(1);
}

const cost = (model: string, usage: { inputTokens: number; outputTokens: number }) => {
  const price = PRICES[model];
  return price ? (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1e6 : 0;
};

async function main() {
  const read = createAnthropicStepsReader({ model: readModel });
  const verify = createAnthropicStepsVerifier({ model: verifyModel });
  const outDir = `samples/eval/steps-${readModel}`;
  mkdirSync(outDir, { recursive: true });

  for (let run = 1; run <= repetitions; run++) {
    console.log(`\nSteps alone, read with ${readModel}, checked with ${verifyModel}`);
    console.log("-".repeat(72));
    let perfect = 0;
    let wrongNumbers = 0;
    let doubtful = 0;
    let alarms = 0;
    let total = 0;
    const tokens = { read: { in: 0, out: 0 }, verify: { in: 0, out: 0 } };
    for (const expected of recipes) {
      const images = [await normalizeImage(readFileSync(expected.photo))];
      try {
        const reading = await read(images);
        const checked = await verify(images, reading.reading.steps);
        writeFileSync(
          `${outDir}/${expected.id}.json`,
          JSON.stringify({ ...reading.reading, verification: checked.verification }, null, 2),
        );
        const score = scoreSteps(expected.steps ?? [], reading.reading.steps);
        const settled = settleSteps(reading.reading, checked.verification.problems);
        const spent = cost(readModel, reading.usage) + cost(verifyModel, checked.usage);
        total += spent;
        tokens.read.in += reading.usage.inputTokens;
        tokens.read.out += reading.usage.outputTokens;
        tokens.verify.in += checked.usage.inputTokens;
        tokens.verify.out += checked.usage.outputTokens;
        if (score.perfect) perfect++;
        wrongNumbers += score.wrongNumbers.length;
        if (settled.doubts.length > 0) doubtful++;
        // A check that complains about a reading that is right is a false alarm.
        if (score.perfect) alarms += checked.verification.problems.length;
        console.log(
          `${expected.id}  ${score.perfect ? "all steps as printed" : "differs"}  ` +
            `read ${reading.usage.inputTokens} in / ${reading.usage.outputTokens} out, ` +
            `check ${checked.usage.inputTokens} in / ${checked.usage.outputTokens} out  ${(spent * 100).toFixed(2)} ct`,
        );
        for (const line of stepScoreLines(score)) console.log(`    ${line}`);
        for (const doubt of settled.doubts) console.log(`    would be stored with: ${doubt}`);
      } catch (error) {
        if (!(error instanceof RecipeReadError)) throw error;
        console.log(`${expected.id}  FAILED  ${error.failure}: ${error.message}`);
      }
    }
    const n = recipes.length;
    console.log(
      `\n=> ${perfect} of ${n} recipes with every step as printed, ${wrongNumbers} steps with a wrong number, ` +
        `${doubtful} would be stored with doubts, ${alarms} false alarms of the check.\n` +
        `   Per recipe: read ${Math.round(tokens.read.in / n)} in / ${Math.round(tokens.read.out / n)} out, ` +
        `check ${Math.round(tokens.verify.in / n)} in / ${Math.round(tokens.verify.out / n)} out, ` +
        `${((total / n) * 100).toFixed(2)} ct for both requests.`,
    );
  }
  console.log(`\nThe answers are in ${outDir}/ (not committed).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
