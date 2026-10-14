import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * The shopping notes as sheets of a small notepad, for whoever would rather take paper than
 * a phone: every errand starts a sheet of its own, with a heading per kind of grocery and a
 * box to tick per line. Black on white, like the note it replaces, with the binding holes
 * along the top and faint ruled lines as the only decoration.
 */

export type PdfSection =
  /** The lines under one heading. */
  | { heading: string; lines: string[] }
  /** A shopping day: it starts a new page, and the sections after it belong to it. */
  | { title: string; subtitle: string };

/** A paper size, and how a note is laid out on it. Lengths in points (1/72 inch). */
interface Paper {
  width: number;
  height: number;
  margin: number;
  columns: number;
  size: { title: number; subtitle: number; heading: number; line: number };
  lineHeight: number;
}

const MM = 72 / 25.4;

/** The sizes a note can be printed on. A6 fits a pocket, A4 is a whole page. */
const PAPERS = {
  A6: {
    width: 105 * MM,
    height: 148 * MM,
    margin: 20,
    columns: 1,
    size: { title: 13, subtitle: 8.5, heading: 9.5, line: 9.5 },
    lineHeight: 14,
  },
  A5: {
    width: 148 * MM,
    height: 210 * MM,
    margin: 28,
    columns: 1,
    size: { title: 16, subtitle: 9.5, heading: 11, line: 10.5 },
    lineHeight: 16,
  },
  A4: {
    width: 210 * MM,
    height: 297 * MM,
    margin: 42,
    columns: 2,
    size: { title: 18, subtitle: 10, heading: 12.5, line: 11 },
    lineHeight: 16,
  },
} satisfies Record<string, Paper>;

/** The size every note is printed on. Change it here; nothing else depends on it. */
export const NOTE_PAPER: keyof typeof PAPERS = "A6";

const GUTTER = 24;
const BLACK = rgb(0, 0, 0);
/** The ruled lines and the edge of the holes: faint, so they use little ink. */
const RULE = rgb(0.78, 0.78, 0.78);
/** The strip at the top of a sheet that holds the binding holes. */
const HOLES = { strip: 18, radius: 3.2, gap: 14 };

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
    // The binding: a row of holes along the top, and the edge the sheet was torn off at.
    const count = Math.floor((width - 2 * HOLES.gap) / (2 * HOLES.radius + HOLES.gap)) + 1;
    const span = (count - 1) * (2 * HOLES.radius + HOLES.gap);
    for (let hole = 0; hole < count; hole++) {
      sheet.drawCircle({
        x: (width - span) / 2 + hole * (2 * HOLES.radius + HOLES.gap),
        y: height - HOLES.strip / 2,
        size: HOLES.radius,
        borderColor: RULE,
        borderWidth: 0.6,
      });
    }
    sheet.drawLine({
      start: { x: 0, y: height - HOLES.strip },
      end: { x: width, y: height - HOLES.strip },
      color: RULE,
      thickness: 0.5,
    });
    page = sheet;
    at = 0;
    top = height - HOLES.strip - margin / 2;
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
