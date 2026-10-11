import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { scoreExtraction, type ExpectedRecipe, type Score } from "@/domain/import/score";
import { createAnthropicReader } from "@/server/import/anthropic-reader";
import { normalizeImage, prepareForModel } from "@/server/import/normalize-image";
import { RecipeReadError } from "@/server/import/read-recipe";
import fixtures from "../tests/fixtures/sample-week/recipes.json";

/**
 * Measures how well a model reads the five sample recipe photos, against the hand-verified
 * reading in the fixtures, and what that costs per recipe.
 *
 *   npm run import:eval                                   model from ANTHROPIC_EXTRACT_MODEL
 *   npm run import:eval -- --model claude-haiku-5-5 --tiles
 *   npm run import:eval -- --model claude-haiku-5-5,claude-sonnet-5-5 --effort high
 *   npm run import:eval -- --runs 3                       repeat, to see how stable a model is
 *
 * --tiles also sends enlarged parts of the page at full resolution. More input tokens, and
 * possibly fewer misread fractions. Every run calls the API and costs money.
 */

/** US dollars per million tokens, input and output, as of October 2026. For estimates only. */
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

const models = (argument("model") ?? process.env.ANTHROPIC_EXTRACT_MODEL ?? "")
  .split(",")
  .filter(Boolean);
const useTiles = process.argv.includes("--tiles");
const effort = (argument("effort") ?? "medium") as "low" | "medium" | "high";
const repetitions = Number(argument("runs") ?? 1);
const recipes = fixtures.recipes as (ExpectedRecipe & { photo: string })[];

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is missing in .env.local. Create a key at platform.claude.com.");
  process.exit(1);
}
if (models.length === 0) {
  console.error("No model given. Set ANTHROPIC_EXTRACT_MODEL in .env.local or pass --model <id>.");
  process.exit(1);
}
const missingPhotos = recipes.filter((r) => !existsSync(r.photo)).map((r) => r.photo);
if (missingPhotos.length > 0) {
  console.error(`Sample photos not found: ${missingPhotos.join(", ")}`);
  process.exit(1);
}

interface Run {
  id: string;
  score: Score | null;
  /** What the model said it was not sure about. Any entry would send the recipe to review. */
  uncertain: string[];
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  seconds: number;
}

function costOf(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  return price ? (inputTokens * price[0] + outputTokens * price[1]) / 1e6 : null;
}

async function evaluate(model: string): Promise<Run[]> {
  const read = createAnthropicReader({ model, effort });
  const outDir = `samples/eval/${model}${useTiles ? "-tiles" : ""}`;
  mkdirSync(outDir, { recursive: true });
  const runs: Run[] = [];

  for (const expected of recipes) {
    const photo = readFileSync(expected.photo);
    const images = useTiles ? await prepareForModel(photo) : [await normalizeImage(photo)];
    const started = Date.now();
    try {
      const reading = await read(images);
      // Kept next to the private photos, for looking at what the model actually returned.
      writeFileSync(`${outDir}/${expected.id}.json`, JSON.stringify(reading.recipe, null, 2));
      runs.push({
        id: expected.id,
        score: scoreExtraction(expected, reading.recipe),
        uncertain: reading.recipe.uncertain.map((u) => `${u.field}: ${u.reason}`),
        error: null,
        inputTokens: reading.usage.inputTokens,
        outputTokens: reading.usage.outputTokens,
        seconds: (Date.now() - started) / 1000,
      });
    } catch (error) {
      // A declined or malformed answer is a result of the measurement, not a crash.
      if (!(error instanceof RecipeReadError)) throw error;
      runs.push({
        id: expected.id,
        score: null,
        uncertain: [],
        error: `${error.failure}: ${error.message}`,
        inputTokens: 0,
        outputTokens: 0,
        seconds: (Date.now() - started) / 1000,
      });
    }
  }
  return runs;
}

function report(model: string, runs: Run[]) {
  console.log(
    `\n${model}, effort ${effort}, ${useTiles ? "page plus enlarged parts" : "page only"}`,
  );
  console.log("-".repeat(72));
  for (const run of runs) {
    const cost = costOf(model, run.inputTokens, run.outputTokens);
    const money = cost === null ? "price unknown" : `${(cost * 100).toFixed(2)} ct`;
    if (!run.score) {
      console.log(`${run.id}  FAILED  ${run.error}`);
      continue;
    }
    const { score } = run;
    const verdict = score.perfect
      ? "all correct"
      : `${score.mistakes.length + score.missing.length + score.extra.length} problems`;
    console.log(
      `${run.id}  ${String(score.matchedLines).padStart(2)}/${score.expectedLines} lines  ${verdict.padEnd(12)} ` +
        `${run.inputTokens} in / ${run.outputTokens} out  ${money}  ${run.seconds.toFixed(0)} s`,
    );
    for (const m of score.mistakes) {
      console.log(
        `    wrong ${m.field} in "${m.where}": expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`,
      );
    }
    for (const line of score.missing) console.log(`    missing: ${line}`);
    for (const line of score.extra) console.log(`    not in the recipe: ${line}`);
    for (const reason of run.uncertain) console.log(`    model is unsure -> review: ${reason}`);
  }
  const scored = runs.filter((r) => r.score);
  const perfect = scored.filter((r) => r.score!.perfect).length;
  const total = runs.reduce(
    (sum, r) => sum + (costOf(model, r.inputTokens, r.outputTokens) ?? 0),
    0,
  );
  const unsure = runs.filter((r) => r.uncertain.length > 0).length;
  console.log(
    `=> ${perfect} of ${runs.length} recipes read without a mistake, ${unsure} sent to review by the model, ` +
      `${((total / runs.length) * 100).toFixed(2)} ct per recipe for one pass.`,
  );
}

async function main() {
  for (const model of models) {
    for (let run = 1; run <= repetitions; run++) {
      if (repetitions > 1) console.log(`\nRun ${run} of ${repetitions}`);
      report(model, await evaluate(model));
    }
  }
  console.log("\nThe model's raw answers are in samples/eval/ (not committed).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
