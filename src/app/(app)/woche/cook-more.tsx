import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { weekdayShort, type IsoDate } from "@/domain/dates";
import type { Meal } from "@/domain/plan";
import { MEAL_NAME } from "@/lib/plan-text";
import { changeExtraPortions, cookMoreOfMeal } from "./actions";

/** The fields that say which meal of which week a form is about. */
function Where({ week, date, meal }: { week: IsoDate; date: IsoDate; meal: Meal }) {
  return (
    <>
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
    </>
  );
}

/** A meal in a few words: "Di Abend". Within a few days the weekday says which one. */
const mealText = (slot: { date: IsoDate; meal: Meal }) =>
  `${weekdayShort(slot.date)} ${MEAL_NAME[slot.meal]}`;

/**
 * "Mehr kochen": a meal cooked with extra portions for leftovers. The portions are bought
 * with it, and the leftovers are planned for a later meal that is still open, which the
 * household picks. The button in the meal's row of actions opens this under the row
 * (`?mehr=<date>.<meal>`), the way "Was könnten wir kochen?" opens a suggestion: the
 * household found it squeezed into the row of signs.
 */
export function CookMore({
  week,
  date,
  meal,
  servings,
  later,
  close,
}: {
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  /** How many extra portions are suggested. */
  servings: number;
  /** The open meals the leftovers can be eaten at, in order. */
  later: { date: IsoDate; meal: Meal }[];
  /** Where "Abbrechen" leads: the week, at this day. */
  close: string;
}) {
  return (
    <form
      action={cookMoreOfMeal}
      className="mt-2 rounded-lg border border-accent/30 bg-accent-soft/40 p-3"
    >
      <Where week={week} date={date} meal={meal} />
      <p className="text-sm font-semibold">Mehr kochen für Reste</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="w-28">
          <span className="label">Extra-Portionen</span>
          <input
            name="extra"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={servings}
            className="field"
          />
        </label>
        <label className="min-w-36 flex-1">
          <span className="label">Reste am</span>
          <select name="reste" defaultValue={later[0] ? slotValue(later[0]) : ""} className="field">
            {later.map((option) => (
              <option key={slotValue(option)} value={slotValue(option)}>
                {mealText(option)}
              </option>
            ))}
            <option value="">Später entscheiden</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton className="btn btn-primary btn-small">Übernehmen</SubmitButton>
        <Link href={close} scroll={false} className="link text-sm">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}

const slotValue = (slot: { date: IsoDate; meal: Meal }) => `${slot.date}.${slot.meal}`;

/**
 * The extra portions of a meal cooked for leftovers, apart from its persons: "2 Extra-
 * Portionen", with minus and plus. Zero cooks the meal as planned again.
 */
export function ExtraPortions({
  week,
  date,
  meal,
  extra,
  leftoversOn,
  what,
}: {
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  extra: number;
  /** The meal the leftovers are planned for, where one is. */
  leftoversOn: { date: IsoDate; meal: Meal } | null;
  what: string;
}) {
  const step = (to: number, sign: string, label: string) => (
    <form action={changeExtraPortions}>
      <Where week={week} date={date} meal={meal} />
      <input type="hidden" name="extra" value={to} />
      <SubmitButton className="" label={label}>
        {sign}
      </SubmitButton>
    </form>
  );
  // The same small stepper as the persons of a meal, on a dashed note: it is for later.
  return (
    <div className="mt-1.5 rounded-lg border border-dashed border-accent/40 px-2 py-1.5">
      <div className="stepper">
        {step(extra - 1, "−", `${what}: eine Extra-Portion weniger`)}
        <span className="stepper-value px-1 text-sm text-accent">
          {extra === 1 ? "1 Extra-Portion" : `${extra} Extra-Portionen`}
        </span>
        {step(Math.min(20, extra + 1), "+", `${what}: eine Extra-Portion mehr`)}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {leftoversOn ? `Für Reste am ${mealText(leftoversOn)}` : "Für Reste"}
      </p>
    </div>
  );
}
