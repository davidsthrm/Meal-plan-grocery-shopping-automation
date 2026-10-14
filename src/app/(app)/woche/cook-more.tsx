import { SubmitButton } from "@/components/submit-button";
import { weekdayShort, type IsoDate } from "@/domain/dates";
import type { Meal } from "@/domain/plan";
import { MEAL_NAME } from "@/lib/plan-text";
import { cookMoreOfMeal } from "./actions";

/**
 * "Mehr kochen": a meal cooked with more portions for leftovers. The portions are bought
 * with it, and the leftovers are planned for a later meal that is still open, which the
 * household picks. Folded away until asked for, like every other detail of a meal.
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
  /** How many more portions are suggested: as many again as the household eats. */
  servings: number;
  /** The open meals the leftovers can be eaten at, in order. */
  later: { date: IsoDate; meal: Meal }[];
  /** The meal in words, for the labels: "Montag Mittag". */
  what: string;
}) {
  return (
    <details className="mt-1">
      <summary
        className="link inline-flex min-h-10 items-center text-sm"
        aria-label={`${what}: mehr kochen`}
      >
        Mehr kochen
      </summary>
      <form
        action={cookMoreOfMeal}
        className="mt-1 grid grid-cols-[3.5rem_minmax(0,1fr)] items-end gap-2 rounded-lg bg-accent-soft/50 p-3 text-sm"
      >
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="meal" value={meal} />
        <label>
          <span className="label">Mehr</span>
          <input
            name="extra"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={servings}
            className="field"
            aria-label="Portionen mehr"
          />
        </label>
        <label className="min-w-0">
          <span className="label">Reste am</span>
          <select name="reste" defaultValue={later[0] ? slotValue(later[0]) : ""} className="field">
            {later.map((option) => (
              <option key={slotValue(option)} value={slotValue(option)}>
                {/* Within three days the weekday says which one. */}
                {weekdayShort(option.date)} {MEAL_NAME[option.meal]}
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
