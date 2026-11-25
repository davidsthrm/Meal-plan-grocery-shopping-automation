"use client";

import { useState } from "react";
import { BALANCE_GROUPS, MEALS_PER_WEEK, type BalanceTargets } from "@/domain/recommend/balance";
import { GROUP_HINT, GROUP_NAME } from "@/lib/plan-text";

/**
 * What a week should contain: for each kind of meal at least and at most how often, "egal"
 * for no limit. Read back by `saveTargets` from `<group>-min` and `<group>-max`.
 *
 * "höchstens" offers nothing below "mindestens", and rises with it: a pair that did not fit
 * together was refused only after "Speichern", and every other change on the page was gone
 * (audit, 24 November 2026).
 */
export function TargetsFields({ targets }: { targets: BalanceTargets }) {
  const [limits, setLimits] = useState(() =>
    Object.fromEntries(
      BALANCE_GROUPS.map((group) => [
        group,
        { min: String(targets[group].min ?? ""), max: String(targets[group].max ?? "") },
      ]),
    ),
  );
  const change = (group: string, limit: "min" | "max", value: string) =>
    setLimits((all) => {
      const next = { ...all[group], [limit]: value };
      // A limit below the new least goes up to it.
      if (limit === "min" && next.max !== "" && Number(next.max) < Number(value)) {
        next.max = value;
      }
      return { ...all, [group]: next };
    });
  return (
    <>
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
                    value={limits[group][limit]}
                    onChange={(event) => change(group, limit, event.target.value)}
                    aria-label={`${GROUP_NAME[group]} ${limit === "min" ? "mindestens" : "höchstens"}`}
                    className="field min-w-24"
                  >
                    <option value="">egal</option>
                    {Array.from({ length: MEALS_PER_WEEK + 1 }, (_, count) => count)
                      .filter((count) =>
                        limit === "min" ? count > 0 : count >= Number(limits[group].min),
                      )
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
    </>
  );
}
