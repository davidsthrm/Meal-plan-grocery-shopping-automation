"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { GAP } from "@/domain/import/steps";
import { parseIngredientLine } from "@/domain/library/typed-recipe";
import { scaleFactor, type Servings } from "@/domain/recipe";
import { scaleLine, scaleStep, type StepIngredient, type StepPart } from "@/domain/scaling";
import type { Unit } from "@/domain/units";
import { plannedText } from "@/lib/plan-text";
import { amountText } from "@/lib/recipe-text";
import { PersonIcon } from "./icons";

/**
 * How much of a recipe is cooked, for the whole recipe page: the stepper next to "Zutaten"
 * changes the ingredients, the amounts inside the steps and the view for cooking at once.
 * Nothing goes to the server; the number is kept in the address (`?portionen=`), so that a
 * reload or the way back finds it again. A recipe opened from a planned meal starts with that
 * meal's servings, its extra portions included.
 */

/** An ingredient line as the page shows it, before scaling. */
export interface RecipeLine {
  id: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: Unit | null;
  /** The household's word for a known ingredient; null for a line the catalog does not know. */
  name: string | null;
  /** Its word for one piece, where that is another ("Zitrone" for "Zitronen"). */
  one: string | null;
  /** The line as printed. */
  printed: string;
  note: string | null;
  alternative: boolean;
  optional: boolean;
}

interface Scale {
  servings: number;
  factor: number;
  /** The steps as printed instead of scaled. */
  printed: boolean;
  setServings: (servings: number) => void;
  setPrinted: (printed: boolean) => void;
  base: Servings;
  ingredients: readonly StepIngredient[];
}

const ScaleContext = createContext<Scale | null>(null);

/** The scale of the recipe page; as printed where the page has none (no servings known). */
function useScale(): Scale | null {
  return useContext(ScaleContext);
}

/** The most the stepper goes to, as on the week plan. */
const MOST = 99;

export function ServingsScale({
  base,
  start,
  ingredients,
  children,
}: {
  /** What the recipe's amounts are for. Null where nobody knows: then nothing scales. */
  base: Servings | null;
  start: number;
  ingredients: StepIngredient[];
  children: ReactNode;
}) {
  const [servings, setCount] = useState(start);
  const [printed, setPrinted] = useState(false);
  const setServings = useCallback((next: number) => {
    const count = Math.min(MOST, Math.max(1, Math.round(next)));
    setCount(count);
    // In the address, so that a reload or the way back to the recipe finds it again.
    const url = new URL(window.location.href);
    url.searchParams.set("portionen", String(count));
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const value = useMemo<Scale | null>(
    () =>
      base && {
        servings,
        factor: scaleFactor(base, servings),
        printed,
        setServings,
        setPrinted,
        base,
        ingredients,
      },
    [base, servings, printed, setServings, ingredients],
  );
  return <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>;
}

/**
 * "− 6 +" with a person's sign, or the recipe's own unit ("− 2 Springformen +"). A recipe
 * that counts tins is made as written until someone asks for more tins.
 */
export function ServingsStepper() {
  const scale = useScale();
  if (!scale) return null;
  const { servings, setServings, base } = scale;
  const amount = plannedText(servings, base.unit);
  return (
    <div className="stepper" role="group" aria-label="Menge" title={amount}>
      <button
        type="button"
        aria-label="Weniger"
        disabled={servings <= 1}
        onClick={() => setServings(servings - 1)}
      >
        −
      </button>
      <span className="stepper-value" aria-live="polite">
        {base.unit === null ? (
          <>
            <PersonIcon />
            <span aria-hidden>{servings}</span>
            <span className="sr-only">{amount}</span>
          </>
        ) : (
          <span className="px-1 text-sm">{amount}</span>
        )}
      </span>
      <button
        type="button"
        aria-label="Mehr"
        disabled={servings >= MOST}
        onClick={() => setServings(servings + 1)}
      >
        +
      </button>
    </div>
  );
}

/** An amount and the name of a line, as cooked: "300 g", "Mehl"; and whether it changed. */
export function useScaledLine(line: RecipeLine): {
  amount: string;
  name: string;
  scaled: boolean;
} {
  const factor = useScale()?.factor ?? 1;
  const { quantity, quantityMax } = scaleLine(line.quantity, line.quantityMax, line.unit, factor);
  const amount = amountText(quantity, quantityMax, line.unit);
  const scaled = amount !== amountText(line.quantity, line.quantityMax, line.unit);
  const most = quantityMax ?? quantity;
  const name =
    line.name !== null
      ? line.unit === "Stück" && most !== null && most <= 1 && line.one
        ? line.one
        : line.name
      : // A printed line names its own amount: scaled, its name alone stands beside the new one.
        scaled
        ? (parseIngredientLine(line.printed)?.name ?? line.printed)
        : line.printed;
  return { amount, name, scaled };
}

/** What a scaled number says it was: "Umgerechnet, im Rezept: 2". */
function ScaledText({ text, original }: { text: string; original: string }) {
  return (
    <span className="scaled" title={`Umgerechnet, im Rezept: ${original}`}>
      {text}
    </span>
  );
}

/** The list of ingredients, scaled. */
export function ScaledIngredients({ lines }: { lines: RecipeLine[] }) {
  return (
    <ul className="card divide-y divide-line">
      {lines.map((line) => (
        <IngredientRow key={line.id} line={line} />
      ))}
    </ul>
  );
}

function IngredientRow({ line }: { line: RecipeLine }) {
  const { amount, name, scaled } = useScaledLine(line);
  return (
    <li className="flex gap-3 px-4 py-2">
      <span className="w-24 shrink-0 text-right text-muted">
        {scaled ? (
          <ScaledText
            text={amount}
            original={amountText(line.quantity, line.quantityMax, line.unit)}
          />
        ) : (
          amount
        )}
      </span>
      <span>
        {name}
        {line.note && <span className="text-muted">, {line.note}</span>}
        {line.alternative && <span className="text-muted"> (Alternative)</span>}
        {line.optional && <span className="text-muted"> (nach Belieben)</span>}
      </span>
    </li>
  );
}

/** A step as cooked, or as printed while the switch below the steps says so. */
export function useScaledStep(text: string): StepPart[] {
  const scale = useScale();
  return useMemo(
    () => (scale && !scale.printed ? scaleStep(text, scale.factor, scale.ingredients) : [text]),
    [scale, text],
  );
}

/** A step with its scaled amounts marked, and "[…]" where it could not be read. */
export function ScaledStep({ text }: { text: string }) {
  const parts = useScaledStep(text);
  return (
    <>
      {parts.map((part, at) =>
        typeof part === "string" ? (
          <Gaps key={at} text={part} />
        ) : (
          <ScaledText key={at} text={part.text} original={part.original} />
        ),
      )}
    </>
  );
}

/** A part of a step with what could not be read marked. */
function Gaps({ text }: { text: string }) {
  return text.split(GAP).map((piece, at) => (
    <span key={at}>
      {at > 0 && <span className="rounded bg-warn-soft px-1 font-semibold text-warn">{GAP}</span>}
      {piece}
    </span>
  ));
}

/**
 * Under the steps, where any amount in them changed: what they are scaled to, and a switch
 * to read them as printed.
 */
export function StepsScaleNote({ steps }: { steps: string[] }) {
  const scale = useScale();
  const changes = useMemo(
    () =>
      scale !== null &&
      steps.some((step) =>
        scaleStep(step, scale.factor, scale.ingredients).some((part) => typeof part !== "string"),
      ),
    [scale, steps],
  );
  if (!scale || !changes) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 px-4 py-1 text-sm text-muted">
      <span>
        {scale.printed
          ? "Mengen wie im Rezept"
          : `Mengen für ${plannedText(scale.servings, scale.base.unit)}`}
      </span>
      <button
        type="button"
        className="link link-quiet inline-flex min-h-11 items-center"
        aria-pressed={scale.printed}
        onClick={() => scale.setPrinted(!scale.printed)}
      >
        {scale.printed ? "Umgerechnet zeigen" : "Wie gedruckt zeigen"}
      </button>
    </div>
  );
}

/** "6 Personen", or the recipe's own unit, for the facts of the view for cooking. */
export function useServingsText(): string | null {
  const scale = useScale();
  return scale && plannedText(scale.servings, scale.base.unit);
}
