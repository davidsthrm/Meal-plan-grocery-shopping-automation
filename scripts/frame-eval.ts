import { readdirSync, readFileSync } from "node:fs";
import { createAnthropicFramer } from "@/server/import/anthropic-reader";
import { framePage } from "@/server/import/frame";
import { normalizeImage, turnImage } from "@/server/import/normalize-image";

/**
 * Measures whether pages are turned upright: every sample photo is laid on each of its four
 * sides and has to come back upright. Calls the model, so it costs a little.
 *
 *   npm run import:eval-frame                      the sample recipes
 *   npm run import:eval-frame -- <folder>          upright photos of your own
 */
const model = process.env.ANTHROPIC_EXTRACT_MODEL;
if (!model) throw new Error("ANTHROPIC_EXTRACT_MODEL is not set. See .env.example.");
const frame = createAnthropicFramer({ model });

/** Photos measured side by side. More would only run into the model's rate limits. */
const WORKERS = 4;

async function main() {
  const folder = process.argv[2] ?? "samples/recipes";
  const files = readdirSync(folder).filter((name) => /\.(heic|jpe?g)$/i.test(name));
  let right = 0;
  let total = 0;
  let cost = 0;
  const measure = async (file: string) => {
    const upright = (await normalizeImage(readFileSync(`${folder}/${file}`))).data;
    const row: string[] = [];
    for (const laid of [0, 90, 180, 270]) {
      const photo = laid === 0 ? upright : await turnImage(upright, laid);
      const result = await framePage(photo, [file], frame);
      const ok = (laid + result.turned) % 360 === 0;
      total++;
      if (ok) right++;
      // $0.10 and $0.50 per million tokens in and out.
      cost += (result.usage.inputTokens * 0.1 + result.usage.outputTokens * 0.5) / 1e6;
      row.push(`${laid}°: ${ok ? "upright" : `WRONG (turned ${result.turned}°)`}`);
    }
    console.log(`${file.padEnd(18)} ${row.join("   ")}`);
  };
  const waiting = [...files];
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      for (let file = waiting.shift(); file; file = waiting.shift()) await measure(file);
    }),
  );
  console.log(
    `\n=> ${right} of ${total} came back upright, ${((cost / total) * 100).toFixed(3)} ct per page.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
