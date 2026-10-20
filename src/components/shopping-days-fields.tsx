import {
  BUTCHER_REACH_DAYS,
  drugstoreWeekday,
  WEEKDAY_PLACES,
  type ShoppingDay,
} from "@/domain/shopping-list/trips";
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

/**
 * A weekday as a chip to tick, the same for every place. The seven share a row equally, at
 * most 3.4rem each. On a phone the row reaches a little into the card's edge, so that each
 * day is still 44px wide: in a row that wrapped, Sunday stood alone on a second line.
 */
export const DAYS_ROW = "-mx-1.5 grid max-w-[24.75rem] grid-cols-7 gap-1 sm:mx-0 sm:max-w-[24rem]";
export const CHIP =
  "chip min-w-0 cursor-pointer justify-center px-0 has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-accent";

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
      <div className={DAYS_ROW}>
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
 * The fields for the days a household shops on: a row per place, a box per weekday, the
 * butcher's days last. They are read back with `readDaysForm`.
 */
export function ShoppingDaysFields({ days }: { days: readonly ShoppingDay[] }) {
  return (
    <div className="space-y-3">
      {WEEKDAY_PLACES.map((place) => (
        <fieldset key={place}>
          <legend className="label">{PLACE_NAME[place]}</legend>
          <div className={DAYS_ROW}>
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
          {place === "butcher" && (
            <p className="mt-1.5 text-sm text-muted">
              Zum Metzger geht es nur, wenn eine Mahlzeit Fleisch braucht. Ein Besuch kauft das
              Fleisch für {BUTCHER_REACH_DAYS} Tage im Voraus: am Montag für Montag bis Donnerstag.
              Ist hier kein Tag angehakt, geht es an den Tagen von Supermarkt und Markt zum Metzger.
            </p>
          )}
        </fieldset>
      ))}
    </div>
  );
}
