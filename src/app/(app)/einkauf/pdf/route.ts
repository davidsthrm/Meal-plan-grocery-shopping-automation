import { isIsoDate, mondayOf, planningWeek, weekRange } from "@/domain/dates";
import { coversText, dayTitle, KIND_NAME, neededText } from "@/lib/list-text";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { chosenShop, loadShoppingLists } from "@/server/shopping/list";
import { shoppingListPdf, type PdfSection } from "@/server/shopping/pdf";
import { createSessionClient } from "@/server/supabase/server";

/**
 * The shopping lists of a week as a PDF to print or pass on: what is still to buy, one
 * shopping day after the other, or with `tag` that day alone.
 */
export async function GET(request: Request): Promise<Response> {
  const household = await requireHousehold();
  const params = new URL(request.url).searchParams;
  const asked = params.get("w");
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : planningWeek(today());
  const { days, index } = await loadShoppingLists(await createSessionClient(), household, week);
  const only = params.get("tag");
  const wanted = days.filter((day) => (only ? day.trip.date === only : day.open > 0));

  const sections = wanted.flatMap(({ trip, view }): PdfSection[] => {
    const covers = coversText(view);
    return [
      {
        title: dayTitle(trip),
        subtitle: [KIND_NAME[trip.kind], covers].filter(Boolean).join(", "),
      },
      ...view.groups.map(({ aisleGroup, lines }) => ({
        heading: aisleGroup.name,
        lines: lines
          .filter((line) => !line.checked)
          .map((line) => {
            const shop = chosenShop(index, line);
            return shop ? `${line.text} (${shop})` : line.text;
          }),
      })),
      {
        heading: "Kurz vorher besorgen",
        lines: view.later
          .filter((line) => !line.checked)
          .map((line) => `${line.text} (${neededText(line)})`),
      },
    ];
  });
  const pdf = await shoppingListPdf(`Einkaufszettel ${weekRange(week)}`, sections);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Einkaufszettel-${only ?? week}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
