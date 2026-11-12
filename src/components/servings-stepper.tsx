"use client";

import { useFormStatus } from "react-dom";
import { servingsAfterStep, shownServings } from "@/domain/servings-step";
import { plannedText } from "@/lib/plan-text";
import { PersonIcon } from "./icons";

/**
 * Plus and minus for how much of a recipe is made, as a small stepper: "− 4 +" with a sign
 * for persons, or the recipe's own unit ("1 Springform"). Zero takes the recipe away.
 *
 * One form whose two buttons each send the number they lead to, so it works as a plain form
 * before any script. Once scripts run, the number changes with the tap: it shows what the
 * tap on its way asked for (`useFormStatus`), and the next tap goes on from there. Each "+"
 * was a form with a number worked out on the server, so three quick taps sent the same one
 * three times, and nothing changed until the page came back (November 2026).
 */
export function ServingsStepper({
  action,
  fields,
  servings,
  unit,
  title,
}: {
  action: (form: FormData) => Promise<void>;
  /** What says which recipe of what is meant. */
  fields: Record<string, string>;
  servings: number;
  unit: string | null;
  title: string;
}) {
  return (
    <form action={action} className="stepper" title={plannedText(servings, unit)}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Steps servings={servings} unit={unit} title={title} />
    </form>
  );
}

function Steps({
  servings,
  unit,
  title,
}: {
  servings: number;
  unit: string | null;
  title: string;
}) {
  const { data } = useFormStatus();
  const shown = shownServings(servings, data?.get("servings"));
  const amount = plannedText(shown, unit);
  // Not the busy `SubmitButton`: it would refuse the next tap until the first is answered.
  // At zero the recipe is going: nothing more to step.
  const step = (by: 1 | -1, sign: string, label: string) => (
    <button
      name="servings"
      value={servingsAfterStep(shown, by)}
      aria-label={label}
      disabled={shown === 0}
    >
      {sign}
    </button>
  );
  return (
    <>
      {step(-1, "−", `Weniger von ${title}`)}
      <span className="stepper-value">
        {unit === null ? (
          <>
            <PersonIcon />
            <span aria-hidden>{shown}</span>
            <span className="sr-only">{amount}</span>
          </>
        ) : (
          <span className="px-1 text-sm">{amount}</span>
        )}
      </span>
      {step(1, "+", `Mehr von ${title}`)}
    </>
  );
}
