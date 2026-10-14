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
 * household picks. A text button in the row of the meal's actions; open, it takes the
 * row's whole width.
 */
export function CookMore({
  week,
  date,
  meal,
  servings,
  later,
  what,
}: {
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  /** How many extra portions are suggested. */
  servings: number;
  /** The open meals the leftovers can be eaten at, in order. */
  later: { date: IsoDate; meal: Meal }[];
  /** The meal in words, for the labels: "Montag Mittag". */
  what: string;
}) {
  return (
    <details className="open:basis-full">
      <summary
        className="link inline-flex min-h-10 cursor-pointer items-center text-sm"
        aria-label={`${what}: mehr kochen`}
      >
        Mehr kochen
      </summary>
      <form
        action={cookMoreOfMeal}
        className="mt-1 grid grid-cols-[3.5rem_minmax(0,1fr)] items-end gap-2 rounded-lg bg-accent-soft/50 p-3 text-sm"
      >
        <Where week={week} date={date} meal={meal} />
        <label>
          <span className="label">Extra</span>
          <input
            name="extra"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={servings}
            className="field"
            aria-label="Extra-Portionen"
          />
        </label>
        <label className="min-w-0">
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
        <span className="col-span-2">
          <SubmitButton className="btn btn-primary btn-small">Mehr kochen</SubmitButton>
        </span>
      </form>
    </details>
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
      <SubmitButton
        className="btn h-10 min-h-0 w-10 rounded-full p-0 text-lg leading-none"
        label={label}
      >
        {sign}
      </SubmitButton>
    </form>
  );
  return (
    <div className="mt-1 rounded-lg border border-dashed border-accent/40 px-2 py-1.5">
      <div className="flex items-center gap-2">
        {step(extra - 1, "−", `${what}: eine Extra-Portion weniger`)}
        <span className="min-w-24 text-center text-sm font-semibold text-accent">
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
