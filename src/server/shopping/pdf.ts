import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { NOTE_PAPER, PAPERS, type Paper } from "@/lib/note-paper";
import type { PdfSection } from "@/lib/pdf-sections";

/**
 * The shopping notes as sheets of a small notepad, for whoever would rather take paper than
 * a phone: every errand starts a sheet of its own, with a heading per kind of grocery and a
 * box to tick per line. Black on white, like the note it replaces, with faint ruled lines
 * as the only decoration.
 */

const GUTTER = 24;
const BLACK = rgb(0, 0, 0);
/** The ruled lines: faint, so they use little ink. */
const RULE = rgb(0.78, 0.78, 0.78);

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
  documentTitle: string,
  sections: PdfSection[],
  paper: Paper = PAPERS[NOTE_PAPER],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(documentTitle);
  pdf.setLanguage("de-DE");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height, margin, columns, size, lineHeight } = paper;
  const column = (width - 2 * margin - (columns - 1) * GUTTER) / columns;
  const box = Math.round(size.line * 0.75);

  let page: PDFPage | null = null;
  let at = 0;
  // Where the next thing is drawn, measured from the bottom of the page.
  let y = 0;
  // Below the title on the first page of a day, from the top on every other one.
  let top = 0;
  const x = () => margin + at * (column + GUTTER);
  const newPage = (): PDFPage => {
    const sheet = pdf.addPage([width, height]);
    page = sheet;
    at = 0;
    top = height - margin;
    y = top;
    return sheet;
  };

  /** Makes room for `needed`, in the next column or on the next page if this one is full. */
  const need = (needed: number): PDFPage => {
    if (page && y - needed >= margin) return page;
    if (page && at < columns - 1) {
      at += 1;
      y = top;
      return page;
    }
    return newPage();
  };

  for (const section of sections) {
    if ("title" in section) {
      const sheet = newPage();
      for (const row of wrap(
        printable(section.title, bold),
        bold,
        size.title,
        width - 2 * margin,
      )) {
        sheet.drawText(row, { x: margin, y: y - size.title, size: size.title, font: bold });
        y -= size.title + 4;
      }
      if (section.subtitle !== "") {
        sheet.drawText(printable(section.subtitle, regular), {
          x: margin,
          y: y - size.subtitle,
          size: size.subtitle,
          font: regular,
        });
        y -= size.subtitle + 6;
      }
      y -= 6;
      top = y;
      continue;
    }
    if ("shop" in section) {
      // The supermarket, its name over the column with a rule beneath, and its kinds of
      // grocery below it. It does not stand alone at the bottom of a column either.
      const shopSize = size.heading + 1.5;
      const sheet = need(shopSize + 8 + size.heading + 10 + lineHeight);
      if (y !== top) y -= 12;
      sheet.drawText(printable(section.shop, bold), {
        x: x(),
        y: y - shopSize,
        size: shopSize,
        font: bold,
      });
      y -= shopSize + 4;
      sheet.drawLine({
        start: { x: x(), y },
        end: { x: x() + column, y },
        color: BLACK,
        thickness: 0.8,
      });
      y -= 2;
      continue;
    }
    if (section.lines.length === 0) continue;
    // A heading does not stand alone at the bottom of a column.
    let sheet = need(size.heading + 10 + lineHeight);
    if (y !== top) y -= 8;
    sheet.drawText(printable(section.heading, bold), {
      x: x(),
      y: y - size.heading,
      size: size.heading,
      font: bold,
    });
    y -= size.heading + 4;

    for (const line of section.lines) {
      const rows = wrap(printable(line, regular), regular, size.line, column - box - 6);
      sheet = need(rows.length * lineHeight);
      sheet.drawRectangle({
        x: x(),
        y: y - lineHeight + (lineHeight - box) / 2,
        width: box,
        height: box,
        borderColor: BLACK,
        borderWidth: 0.7,
      });
      for (const row of rows) {
        sheet.drawText(row, {
          x: x() + box + 6,
          y: y - lineHeight + (lineHeight - size.line) / 2 + 1.5,
          size: size.line,
          font: regular,
        });
        y -= lineHeight;
      }
      // The ruled line under it, as on a pad.
      sheet.drawLine({
        start: { x: x(), y },
        end: { x: x() + column, y },
        color: RULE,
        thickness: 0.4,
      });
    }
  }
  // A week with nothing to buy is still a document that opens.
  if (!page) newPage();
  return pdf.save();
}
