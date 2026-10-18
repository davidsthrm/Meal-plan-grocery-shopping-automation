import { isIsoDate, mondayOf, planningWeek } from "@/domain/dates";
import { planNote } from "@/lib/plan-note";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { must } from "@/server/catalog";
import { planNotePdf } from "@/server/planning/plan-pdf";
import { loadExtras, loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";

/**
 * The plan of a week as a small note for the pinboard (A6). It opens in the browser, to be
 * printed from there or kept.
 */
export async function GET(request: Request): Promise<Response> {
  await requireHousehold();
  const asked = new URL(request.url).searchParams.get("w");
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : planningWeek(today());
  const db = await createSessionClient();
  const [slots, extras] = await Promise.all([loadWeek(db, week), loadExtras(db, week)]);
  const ids = [
    ...new Set([
      ...slots
        .flatMap((slot) => (slot.kind === "recipes" ? slot.items : []))
        .map((i) => i.recipeId),
      ...extras.map((extra) => extra.recipeId),
    ]),
  ];
  // Row level security lets this read the household's own recipes only.
  const titles =
    ids.length === 0
      ? []
      : must(await db.from("recipe").select("id, title").in("id", ids), "load titles");
  const titleOf = new Map(titles.map((recipe) => [recipe.id, recipe.title]));
  const pdf = await planNotePdf(planNote(week, slots, extras, (id) => titleOf.get(id) ?? null));
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Wochenplan-${week}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
