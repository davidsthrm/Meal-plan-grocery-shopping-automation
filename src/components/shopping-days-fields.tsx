import { DAY_PLACES, drugstoreWeekday, type ShoppingDay } from "@/domain/shopping-list/trips";
import { PLACE_NAME } from "@/lib/list-text";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const WEEKDAYS_LONG = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

/** A weekday as a chip to tick, the same for every place. */
const CHIP =
  "chip min-w-11 cursor-pointer justify-center px-0 has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-accent";

/**
 * The day the household goes to the drugstore: a row of weekdays like the others, of which
 * one is ticked. Its note is there every week and is written by hand. Read back with
 * `readWeekday` from `tag-drugstore`.
 */
export function DrugstoreDayField({ days }: { days: readonly ShoppingDay[] }) {
  const chosen = drugstoreWeekday(days);
  return (
    <fieldset>
      <legend className="label">{PLACE_NAME.drugstore}</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((name, at) => (
          <label key={name} className={CHIP}>
            <input
              type="radio"
              name="tag-drugstore"
              value={at + 1}
              defaultChecked={chosen === at + 1}
              aria-label={`${PLACE_NAME.drugstore} am ${WEEKDAYS_LONG[at]}`}
              className="sr-only"
            />
            {name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The fields for the days a household shops on: a row per place, a box per weekday. They
 * are read back with `readDaysForm`.
 */
export function ShoppingDaysFields({ days }: { days: readonly ShoppingDay[] }) {
  return (
    <div className="space-y-3">
      {DAY_PLACES.map((place) => (
        <fieldset key={place}>
          <legend className="label">{PLACE_NAME[place]}</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((name, at) => (
              <label key={name} className={CHIP}>
                <input
                  type="checkbox"
                  name={`tage-${place}`}
                  value={at + 1}
                  defaultChecked={days.some(
                    (day) => day.weekday === at + 1 && day.places.includes(place),
                  )}
                  aria-label={`${PLACE_NAME[place]} am ${WEEKDAYS_LONG[at]}`}
                  className="sr-only"
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
