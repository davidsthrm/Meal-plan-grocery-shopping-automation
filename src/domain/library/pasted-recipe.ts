import type { ExtractedIngredient, ExtractedRecipe } from "../import/extraction";
import { resolveServings } from "../import/servings";
import type { TypedRecipeInput } from "./typed-recipe";

/**
 * A recipe that came in as pasted text. The reading of it fills the form a typed recipe is
 * entered in, so that a person looks at it before it is saved: one ingredient per line, as
 * on a shopping note.
 */

/** Longer than any recipe; more is somebody's whole document. */
export const PASTED_TEXT_MAX = 12000;

export interface PastedRecipe {
  values: TypedRecipeInput;
  /** What the person should look at before saving, in German. */
  check: string[];
}

const number = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

/** One ingredient as a typed line: "200 g Spaghetti", "2-3 Tomaten, gewürfelt", "Salz". */
export function typedLine(line: ExtractedIngredient): string {
  const amount =
    line.quantity === null
      ? ""
      : line.quantityMax !== null && line.quantityMax > line.quantity
        ? `${number(line.quantity)}-${number(line.quantityMax)}`
        : number(line.quantity);
  // A bare number counts pieces, so "Stück" is not written out.
  const unit = line.unit === null || line.unit === "Stück" ? "" : line.unit;
  // The form has one amount per line. A second printed measure is kept as a note.
  const second =
    line.secondaryQuantity !== null && line.secondaryUnit !== null
      ? `${line.secondaryScope === "perPiece" ? "je " : ""}${number(line.secondaryQuantity)} ${line.secondaryUnit}`
      : "";
  const note = [line.note.trim(), second].filter(Boolean).join(", ");
  return [amount, unit, line.name.trim()].filter(Boolean).join(" ") + (note ? `, ${note}` : "");
}

/** Turns what was read from a pasted text into the fields of the form for a new recipe. */
export function pastedRecipe(extracted: ExtractedRecipe, defaultServings: number): PastedRecipe {
  const check: string[] = [];
  if (!extracted.title) check.push("Im Text steht kein Titel.");
  const servings = resolveServings(extracted);
  if (!servings) {
    check.push(`Im Text steht nicht, für wie viele es reicht. Eingetragen ist ${defaultServings}.`);
  }
  const lines: string[] = [];
  for (const line of extracted.ingredients) {
    // "oder Petersilie": not something to buy as well.
    if (line.alternativeTo !== null) {
      check.push(`Als Alternative weggelassen: ${line.raw.trim() || line.name}`);
      continue;
    }
    lines.push(typedLine(line));
    if (line.unclear) check.push(`Bitte prüfen: ${line.raw.trim() || line.name}`);
  }
  if (lines.length === 0) check.push("Im Text wurden keine Zutaten gefunden.");
  for (const doubt of extracted.uncertain) check.push(`Unsicher (${doubt.field}): ${doubt.reason}`);

  const known = new Set(["vegetarian", "vegan", "fish", "poultry", "red_meat"]);
  return {
    values: {
      title: extracted.title ?? "",
      category: extracted.dishType === "unbekannt" ? "" : extracted.dishType,
      protein: known.has(extracted.proteinType) ? extracted.proteinType : "",
      servings: String(servings?.min ?? defaultServings),
      servingsUnit: servings?.unit ?? "",
      minutes: extracted.prepMinutes === null ? "" : String(extracted.prepMinutes),
      book: "",
      page: "",
      lines: lines.join("\n"),
    },
    check,
  };
}
