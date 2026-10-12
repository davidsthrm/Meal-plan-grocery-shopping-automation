import {
  isIsoDate,
  mondayOf,
  planningWeek,
  weekdayLong,
  weekRange,
  dayAndMonth,
} from "@/domain/dates";
import { neededText } from "@/lib/list-text";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadShoppingList } from "@/server/shopping/list";
import { shoppingListPdf } from "@/server/shopping/pdf";
import { createSessionClient } from "@/server/supabase/server";

/** The shopping list of a week as a PDF to print or pass on: what is still to buy. */
export async function GET(request: Request): Promise<Response> {
  const household = await requireHousehold();
  const asked = new URL(request.url).searchParams.get("w");
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : planningWeek(today());
  const list = await loadShoppingList(await createSessionClient(), household, week);
  const open = <T extends { checked: boolean }>(lines: T[]) =>
    lines.filter((line) => !line.checked);

  const sections = [
    ...list.view.shops.map(({ shop, groups }) => ({
      heading: shop.name,
      lines: open(groups.flatMap((group) => group.lines)).map((line) => line.text),
    })),
    {
      heading: "Später frisch kaufen",
      lines: open(list.view.later).map((line) => `${line.text} (${neededText(line)})`),
    },
  ];
  const pdf = await shoppingListPdf(
    `Einkaufsliste ${weekRange(week)}`,
    `Einkauf am ${weekdayLong(list.shoppingDate)}, ${dayAndMonth(list.shoppingDate)}`,
    sections,
  );
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Einkaufsliste-${week}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
