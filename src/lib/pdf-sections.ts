import type { Shop } from "@/domain/catalog";
import type { AisleView, ViewLine } from "@/domain/shopping-list/present";
import { marketsOfNote, namesText, sectionsByShop } from "@/domain/shopping-list/supermarkets";
import type { ShoppingTrip } from "@/domain/shopping-list/trips";
import { coversText, PLACE_NAME, whenText } from "./list-text";

/** What a PDF of shopping notes is made of, from top to bottom. */
export type PdfSection =
  /** A note: it starts a new page, and the sections after it belong to it. */
  | { title: string; subtitle: string }
  /** A supermarket of a note that is taken to several: its kinds of grocery follow. */
  | { shop: string }
  /** The lines of one kind of grocery. */
  | { heading: string; lines: string[] };

/**
 * The notes as the PDF prints them: what is still to buy, by kind of grocery. A supermarket
 * note that is taken to more than one supermarket has a section per supermarket, its name
 * once above its kinds of grocery, as the note on the screen has it.
 */
export function pdfSections(
  notes: readonly { trip: ShoppingTrip; view: AisleView }[],
  /** The household's supermarkets, the main one first. */
  supermarkets: readonly Shop[],
  /** The shop a line names on purpose (`chosenShop`), or null. */
  shopOf: (line: ViewLine) => string | null,
): PdfSection[] {
  return notes.flatMap(({ trip, view }): PdfSection[] => {
    const favourites = trip.place === "supermarket" ? supermarkets : [];
    const parts = sectionsByShop(view, favourites);
    const named = parts.some((part) => part.shop && part.shop !== favourites[0]);
    return [
      {
        // A supermarket note is named after the markets it is taken to: "Aldi & Rewe: Montag,
        // 12. Oktober".
        title: `${namesText(marketsOfNote(view, favourites).map((shop) => shop.name)) || PLACE_NAME[trip.place]}: ${whenText(trip)}`,
        subtitle: coversText(view),
      },
      ...parts.flatMap((part): PdfSection[] => {
        const groups = part.groups
          .map(({ aisleGroup, lines }) => ({
            heading: aisleGroup.name,
            lines: lines
              .filter((line) => !line.checked)
              .map((line) => {
                const shop = shopOf(line);
                return shop ? `${line.text} (${shop})` : line.text;
              }),
          }))
          .filter((group) => group.lines.length > 0);
        if (groups.length === 0) return [];
        return named && part.shop ? [{ shop: part.shop.name }, ...groups] : groups;
      }),
    ];
  });
}
