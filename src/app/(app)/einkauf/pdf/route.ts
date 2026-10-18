import { isIsoDate, mondayOf, planningWeek, weekRange } from "@/domain/dates";
import { pdfSections } from "@/lib/pdf-sections";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { chosenShop, loadShoppingNotes } from "@/server/shopping/list";
import { shoppingListPdf } from "@/server/shopping/pdf";
import { createSessionClient } from "@/server/supabase/server";

/**
 * The shopping notes of a week as a PDF to print or pass on: what is still to buy, every
 * note on a page of its own, or with `zettel` that note alone as a file of its own.
 */
export async function GET(request: Request): Promise<Response> {
  const household = await requireHousehold();
  const params = new URL(request.url).searchParams;
  const asked = params.get("w");
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : planningWeek(today());
  const { notes, index, supermarkets } = await loadShoppingNotes(
    await createSessionClient(),
    household,
    week,
  );
  const only = params.get("zettel");
  const wanted = notes.filter((note) => (only ? note.id === only : note.open > 0));

  const sections = pdfSections(wanted, supermarkets, (line) => chosenShop(index, line));
  const pdf = await shoppingListPdf(`Einkaufszettel ${weekRange(week)}`, sections);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Einkaufszettel-${only ?? week}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
