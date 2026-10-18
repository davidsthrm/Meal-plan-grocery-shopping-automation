import "server-only";
import type { PDFFont } from "pdf-lib";

/** Writing text with the standard fonts of a PDF: the shopping notes and the week's note. */

/** The standard fonts know Western European letters only. Anything else becomes "?". */
export function printable(text: string, font: PDFFont): string {
  const known = new Set(font.getCharacterSet());
  return [...text].map((char) => (known.has(char.codePointAt(0) as number) ? char : "?")).join("");
}

/** Breaks a text into lines that fit the width. A single long word is not broken. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
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
