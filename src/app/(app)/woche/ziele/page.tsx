import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { BALANCE_GROUPS, MEALS_PER_WEEK } from "@/domain/recommend/balance";
import { GROUP_HINT, GROUP_NAME } from "@/lib/plan-text";
import { requireHousehold } from "@/server/auth";
import { keepTargets, saveTargets } from "../actions";

export const metadata: Metadata = { title: "Ziele der Woche" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * What the household wants a week to contain. Shown once on every device before the plan,
 * and reachable from the plan afterwards.
 */
export default async function TargetsPage(props: PageProps<"/woche/ziele">) {
  const params = await props.searchParams;
  const first = one(params.start) === "1";
  const household = await requireHousehold();

  return (
    <div className="mx-auto max-w-xl">
      {!first && (
        <Link href="/woche" className="link text-sm">
          ← Wochenplan
        </Link>
      )}
      <p className="eyebrow mt-3">{first ? "Bevor es losgeht" : "Wochenplan"}</p>
      <h1 className="title mt-1">Ziele der Woche</h1>
      <p className="mt-2 text-muted">
        Wie oft soll es in einer Woche was geben? Die Vorschläge im Wochenplan richten sich danach,
        und die Zeile über dem Plan zählt mit.
      </p>
      {one(params.fehler) === "1" && (
        <p role="alert" className="mt-4 rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn">
          Das passt nicht zusammen: „mindestens“ darf nicht größer sein als „höchstens“.
        </p>
      )}

      <form action={saveTargets} className="mt-6">
        <div className="card divide-y divide-line">
          {BALANCE_GROUPS.map((group) => (
            <fieldset
              key={group}
              className={`kind-${group} grid gap-x-4 gap-y-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center`}
            >
              <legend className="sr-only">{GROUP_NAME[group]}</legend>
              <div aria-hidden>
                <p className="flex items-center gap-2 font-semibold">
                  <span className="dot" />
                  {GROUP_NAME[group]}
                </p>
                <p className="text-sm text-muted">{GROUP_HINT[group]}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["min", "max"] as const).map((limit) => (
                  <label key={limit}>
                    <span className="label">{limit === "min" ? "mindestens" : "höchstens"}</span>
                    <select
                      name={`${group}-${limit}`}
                      defaultValue={household.targets[group][limit] ?? ""}
                      aria-label={`${GROUP_NAME[group]} ${limit === "min" ? "mindestens" : "höchstens"}`}
                      className="field min-w-24"
                    >
                      <option value="">egal</option>
                      {Array.from({ length: MEALS_PER_WEEK + 1 }, (_, count) => count)
                        .filter((count) => limit === "max" || count > 0)
                        .map((count) => (
                          <option key={count} value={count}>
                            {count} mal
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">Mahlzeiten pro Woche, von 14.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <SubmitButton className="btn btn-primary">Speichern</SubmitButton>
          {first && (
            <button formAction={keepTargets} className="btn">
              So lassen
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
