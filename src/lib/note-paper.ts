/**
 * The paper a shopping note is printed on, by "Drucken" and by "Als PDF" alike: one size,
 * set here. A6 fits a pocket: someone who would rather not take a phone takes the note.
 */

/** A paper size, and how a note is laid out on it. Lengths in points (1/72 inch). */
export interface Paper {
  width: number;
  height: number;
  margin: number;
  columns: number;
  size: { title: number; subtitle: number; heading: number; line: number };
  lineHeight: number;
}

const MM = 72 / 25.4;

/** The sizes a note can be printed on. A6 fits a pocket, A4 is a whole page. */
export const PAPERS = {
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

/**
 * The print rules for a note on that paper, for the browser's own print dialog: the page
 * size, its margin, the columns and the size of the writing, as the PDF has them.
 */
export function printRules(paper: Paper = PAPERS[NOTE_PAPER]): string {
  const mm = (points: number) => `${Math.round((points / MM) * 10) / 10}mm`;
  return [
    "@media print {",
    `  @page { size: ${mm(paper.width)} ${mm(paper.height)}; margin: ${mm(paper.margin)}; }`,
    `  html { font-size: ${paper.size.line}pt; }`,
    `  .note-columns { column-count: ${paper.columns}; }`,
    "}",
  ].join("\n");
}
