import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * The shopping list on one or more A4 pages: a heading per shop, a box to tick per line, two
 * columns. Plain black on white, like the list it replaces.
 */

export interface PdfSection {
  heading: string;
  lines: string[];
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const GUTTER = 24;
const COLUMN = (PAGE.width - 2 * MARGIN - GUTTER) / 2;
const SIZE = { title: 18, heading: 12.5, line: 11 };
const LINE_HEIGHT = 16;
const BOX = 8;
const BLACK = rgb(0, 0, 0);

/** The standard fonts know Western European letters only. Anything else becomes "?". */
function printable(text: string, font: PDFFont): string {
  const known = new Set(font.getCharacterSet());
  return [...text].map((char) => (known.has(char.codePointAt(0) as number) ? char : "?")).join("");
}

/** Breaks a text into lines that fit the width. A single long word is not broken. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

export async function shoppingListPdf(
  title: string,
  subtitle: string,
  sections: PdfSection[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage("de-DE");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let column = 0;
  // Where the next thing is drawn, measured from the bottom of the page.
  let y = PAGE.height - MARGIN;
  // Below the title on the first page, from the top on every other one.
  let top = y;
  const x = () => MARGIN + column * (COLUMN + GUTTER);

  page.drawText(printable(title, bold), {
    x: MARGIN,
    y: y - SIZE.title,
    size: SIZE.title,
    font: bold,
  });
  y -= SIZE.title + 8;
  if (subtitle !== "") {
    page.drawText(printable(subtitle, regular), { x: MARGIN, y: y - 10, size: 10, font: regular });
    y -= 18;
  }
  y -= 8;
  top = y;

  /** Makes room for `height`, in the next column or on the next page if this one is full. */
  const need = (height: number) => {
    if (y - height >= MARGIN) return;
    if (column === 0) {
      column = 1;
      y = top;
      return;
    }
    page = pdf.addPage([PAGE.width, PAGE.height]);
    column = 0;
    top = PAGE.height - MARGIN;
    y = top;
  };

  for (const section of sections) {
    if (section.lines.length === 0) continue;
    // A heading does not stand alone at the bottom of a column.
    need(SIZE.heading + 10 + LINE_HEIGHT);
    if (y !== top) y -= 10;
    page.drawText(printable(section.heading, bold), {
      x: x(),
      y: y - SIZE.heading,
      size: SIZE.heading,
      font: bold,
    });
    y -= SIZE.heading + 6;

    for (const line of section.lines) {
      const rows = wrap(printable(line, regular), regular, SIZE.line, COLUMN - BOX - 8);
      need(rows.length * LINE_HEIGHT);
      page.drawRectangle({
        x: x(),
        y: y - LINE_HEIGHT + 4.5,
        width: BOX,
        height: BOX,
        borderColor: BLACK,
        borderWidth: 0.8,
      });
      for (const row of rows) {
        page.drawText(row, {
          x: x() + BOX + 8,
          y: y - LINE_HEIGHT + 5,
          size: SIZE.line,
          font: regular,
        });
        y -= LINE_HEIGHT;
      }
    }
  }
  return pdf.save();
}
