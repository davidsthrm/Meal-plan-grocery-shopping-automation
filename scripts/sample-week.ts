import { weekdayShort } from "@/domain/dates";
import { formatAmount } from "@/domain/shopping-list/format";
import { seedCatalog } from "../supabase/seed/catalog";
import { seedRecipes } from "../supabase/seed/recipes";
import { buildSampleWeek, isAccepted, type LineStatus } from "../tests/acceptance/sample-week";
import inputs from "../tests/fixtures/sample-week/inputs.json";
import plan from "../tests/fixtures/sample-week/plan.json";

/**
 * Prints the shopping list the app builds for the sample week and compares it with the
 * handwritten one. Exits with 1 when something differs that no pending recipe explains.
 *
 *   npm run sample-week
 */

const week = buildSampleWeek();
const out: string[] = [];
const heading = (text: string) => out.push("", text, "-".repeat(text.length));

heading(`Plan, week of ${plan.weekStart}`);
for (const slot of week.slots) {
  const what =
    slot.kind === "recipes"
      ? slot.items.map((i) => seedRecipes.find((r) => r.id === i.recipeId)?.title).join(" + ")
      : slot.kind === "free_text" || slot.kind === "away"
        ? slot.label
        : slot.kind === "leftovers"
          ? "Reste"
          : "(frei)";
  const kind =
    slot.kind === "recipes"
      ? "recipe"
      : slot.kind !== "free_text"
        ? slot.kind
        : inputs.noRecipe.meals.includes(slot.label)
          ? "no recipe"
          : "recipe pending";
  out.push(`${weekdayShort(slot.date)} ${slot.meal.padEnd(6)}  ${String(what).padEnd(46)} ${kind}`);
}

heading(`Einkaufsliste, shopping day ${weekdayShort(plan.weekStart)} ${plan.weekStart}`);
for (const section of week.view.shops) {
  out.push("", section.shop.shortLabel);
  section.groups.forEach((group, i) => {
    if (i > 0) out.push("");
    for (const line of group.lines) out.push(`  ${line.text}`);
  });
}

heading("Später frisch kaufen");
for (const line of week.view.later) {
  const shop = seedCatalog.shops.find((s) => s.id === line.shopId)?.shortLabel;
  const exact = line.line.amounts.map(formatAmount).join(" + ");
  out.push(
    `  ${line.text.padEnd(22)} für ${weekdayShort(line.line.neededBy!)}, ${shop}   (${exact})`,
  );
}

heading(`Haben wir schon (${week.view.atHome.length})`);
const staples = week.view.atHome.filter((v) => v.line.defaultAtHome).map((v) => v.line.label);
const ticked = week.view.atHome.filter((v) => !v.line.defaultAtHome).map((v) => v.line.label);
out.push(`  pre-ticked staples: ${staples.join(", ")}`);
out.push(`  ticked by hand:     ${ticked.join(", ")}`);

heading("Compared with the handwritten list");
const MARK: Record<LineStatus, string> = {
  match: "ok     ",
  different: "DIFFERS",
  pending: "pending",
  missing: "MISSING",
};
for (const line of week.compared) {
  const detail =
    line.status === "pending" ? `waits for recipe: ${line.detail}` : (line.detail ?? "");
  out.push(`  ${MARK[line.status]}  ${line.shop.padEnd(5)} ${line.raw.padEnd(18)} ${detail}`);
}
for (const text of week.extra) out.push(`  EXTRA    generated but not handwritten: ${text}`);
for (const raw of week.outOfOrder)
  out.push(`  ORDER    handwritten earlier than its aisle allows: ${raw}`);
if (week.later.actual.join() !== week.later.expected.join()) {
  out.push(
    `  LATER    expected ${week.later.expected.join(", ")}, got ${week.later.actual.join(", ")}`,
  );
}

const total = week.compared.length;
const matched = week.compared.filter((l) => l.status === "match").length;
const pending = week.compared.filter((l) => l.status === "pending").length;
const accepted = isAccepted(week);
out.push(
  "",
  `${matched} of ${total} handwritten lines reproduced, ${pending} wait for recipes, ` +
    `${total - matched - pending + week.extra.length + week.outOfOrder.length} unexplained.`,
  accepted ? "RESULT: accepted" : "RESULT: differences found",
);

console.log(out.join("\n"));
process.exit(accepted ? 0 : 1);
