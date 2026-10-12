import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The API returns at most a thousand rows per request and cuts a longer answer off without
 * saying so. A query on a table that grows with the household's data therefore has to ask
 * for something that stays small, or read page by page (`allRows`). This looks at the source
 * for reads that do neither. The catalog was read in one request until it had 1024
 * ingredients, and sugar and onions silently stopped existing for the app.
 */

/** Tables that grow with what the household imports and plans. */
const GROWING = [
  "ingredient",
  "ingredient_proposal",
  "recipe",
  "recipe_ingredient",
  "recipe_tag",
  "import_job",
  "import_page",
  "plan_slot",
  "plan_slot_item",
];

/** What keeps the answer of a query small. A status alone does not: most rows are "active". */
const BOUNDED = [
  /\.range\(/,
  /\.limit\(/,
  /\.single\(\)/,
  /\.maybeSingle\(\)/,
  /\.in\(/,
  /head: true/,
  /\.eq\("(id|recipe_id|batch_id|week_plan_id|plan_slot_id|tag_id)"/,
  /\.eq\("status", "(open|needs_review)"\)/,
  /\.(insert|update|delete|upsert)\(/,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("reads of tables that grow", () => {
  it("ask for something small or read page by page", () => {
    const unbounded: string[] = [];
    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      for (const table of GROWING) {
        const pattern = new RegExp(`\\.from\\("${table}"\\)`, "g");
        for (const match of source.matchAll(pattern)) {
          // The statement: up to the next query or the end of this one.
          const rest = source.slice(match.index + match[0].length);
          const end = Math.min(
            ...[rest.indexOf(".from("), rest.indexOf(";"), 600].filter((at) => at >= 0),
          );
          const statement = rest.slice(0, end);
          if (!BOUNDED.some((bound) => bound.test(statement))) {
            const line = source.slice(0, match.index).split("\n").length;
            unbounded.push(`${file}:${line} reads all of "${table}" in one request`);
          }
        }
      }
    }
    expect(unbounded).toEqual([]);
  });
});
