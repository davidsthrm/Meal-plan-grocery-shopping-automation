import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFPage } from "pdf-lib";
import { PAPERS, type Paper } from "@/lib/note-paper";
import type { PlanNote } from "@/lib/plan-note";
import { printable, wrap } from "../pdf-text";

/**
 * The week plan as a small note to pin to the pinboard: the size of a postcard (A6), every
 * day as a row with its meals beside it, black on white. An open meal has a faint line to
 * write on. What the week needs outside its meals stands at the foot.
 */

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);
/** Ruled lines and the lines to write on: faint, so they use little ink. */
const RULE = rgb(0.78, 0.78, 0.78);

const SIZE = { title: 13, day: 10, meal: 7.4, text: 9.6 };
const LINE = 12;
/** A meal's text takes two lines at most; more is cut off with "…". */
const MOST_LINES = 2;

export async function planNotePdf(note: PlanNote, paper: Paper = PAPERS.A6): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(note.title);
  pdf.setLanguage("de-DE");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = Math.min(paper.margin, 18);
  const { width, height } = paper;
  const dayColumn = 38;
  const mealColumn = 32;
  const textX = margin + dayColumn + mealColumn;
  const textWidth = width - margin - textX;

  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;
  const room = (needed: number) => {
    if (y - needed >= margin) return;
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  const rule = (color = RULE) =>
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      color,
      thickness: 0.4,
    });

  for (const row of wrap(printable(note.title, bold), bold, SIZE.title, width - 2 * margin)) {
    page.drawText(row, { x: margin, y: y - SIZE.title, size: SIZE.title, font: bold });
    y -= SIZE.title + 3;
  }
  y -= 5;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    color: BLACK,
    thickness: 0.8,
  });

  for (const day of note.days) {
    const meals = day.meals.map((meal) => {
      if (meal.text === null) return { ...meal, rows: [] as string[] };
      let rows = wrap(printable(meal.text, regular), regular, SIZE.text, textWidth);
      if (rows.length > MOST_LINES)
        rows = [...rows.slice(0, MOST_LINES - 1), `${rows[MOST_LINES - 1]} …`];
      return { ...meal, rows };
    });
    const needed = meals.reduce((sum, meal) => sum + Math.max(1, meal.rows.length) * LINE, 0) + 8;
    room(needed);
    y -= 4;
    page.drawText(printable(day.label, bold), {
      x: margin,
      y: y - SIZE.day - 1,
      size: SIZE.day,
      font: bold,
    });
    for (const meal of meals) {
      page.drawText(printable(meal.name, regular), {
        x: margin + dayColumn,
        y: y - SIZE.text,
        size: SIZE.meal,
        font: regular,
        color: GREY,
      });
      if (meal.rows.length === 0) {
        // Nothing planned: a line to write on.
        page.drawLine({
          start: { x: textX, y: y - LINE + 1.5 },
          end: { x: width - margin, y: y - LINE + 1.5 },
          color: RULE,
          thickness: 0.5,
        });
        y -= LINE;
        continue;
      }
      for (const text of meal.rows) {
        page.drawText(text, { x: textX, y: y - SIZE.text, size: SIZE.text, font: regular });
        y -= LINE;
      }
    }
    y -= 4;
    rule();
  }

  if (note.extras.length > 0) {
    room(SIZE.day + 8 + note.extras.length * LINE);
    y -= 6;
    page.drawText("Außerdem", { x: margin, y: y - SIZE.day, size: SIZE.day, font: bold });
    y -= SIZE.day + 4;
    for (const extra of note.extras) {
      for (const row of wrap(printable(extra, regular), regular, SIZE.text, width - 2 * margin)) {
        room(LINE);
        page.drawText(row, { x: margin, y: y - SIZE.text, size: SIZE.text, font: regular });
        y -= LINE;
      }
    }
  }
  return pdf.save();
}
