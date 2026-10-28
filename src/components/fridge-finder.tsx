"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { findFoods, fridgeMatches } from "@/domain/library/fridge";
import type { Pictogram } from "@/domain/library/pictogram";
import { FROM_FRIDGE } from "@/lib/origin";
import { FORWARD } from "@/lib/transitions";
import { CloseIcon } from "./icons";
import { PictogramIcon } from "./pictogram";

/** A recipe as the fridge lists it. */
export interface FridgeItem {
  id: string;
  title: string;
  /** The colour class of its kind ("kind-fish"). */
  kind: string;
  picture: Pictogram;
  /** "30 Min.", or how much work it is. */
  time: string | null;
  uses: number[];
}

/** How many foods are offered to tap, and how many recipes are listed. */
const OFFERED = 18;
const LISTED = 40;
/** How many missing foods a row names before "und 2 weitere". */
const NAMED = 4;

/**
 * "Was ist noch da?": a field to find any food, the foods recipes use most as chips to tap,
 * and the recipes that use most of what is tapped, each saying what it still lacks. It all
 * happens in the browser, at once; what is tapped is kept in the address, so that the way
 * back from a recipe finds it again.
 */
export function FridgeFinder({
  foods,
  counts,
  recipes,
  initial,
}: {
  foods: string[];
  counts: number[];
  recipes: FridgeItem[];
  /** What the address says is there. */
  initial: number[];
}) {
  // From the address where there is one: stepping back to this page shows it from the
  // router's memory, drawn before anything was tapped, while the address kept the taps.
  const [there, setThere] = useState<number[]>(() => {
    if (typeof window === "undefined") return initial;
    const named = new URLSearchParams(window.location.search).getAll("z");
    return named.map((name) => foods.indexOf(name)).filter((food) => food >= 0);
  });
  const [typed, setTyped] = useState("");
  const chosen = useMemo(() => new Set(there), [there]);

  const write = (next: number[]) => {
    setThere(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("z");
    for (const food of next) url.searchParams.append("z", foods[food]);
    window.history.replaceState(window.history.state, "", url);
  };
  const toggle = (food: number) =>
    write(chosen.has(food) ? there.filter((entry) => entry !== food) : [...there, food]);
  const pick = (food: number) => {
    if (!chosen.has(food)) write([...there, food]);
    setTyped("");
  };

  const offered = useMemo(
    () =>
      counts
        .map((count, food) => ({ food, count }))
        .filter((entry) => !chosen.has(entry.food))
        .sort((a, b) => b.count - a.count || foods[a.food].localeCompare(foods[b.food], "de"))
        .slice(0, OFFERED)
        .map((entry) => entry.food),
    [counts, chosen, foods],
  );
  const found = findFoods(foods, counts, typed).filter((food) => !chosen.has(food));
  const matches = useMemo(() => fridgeMatches(recipes, chosen).slice(0, LISTED), [recipes, chosen]);

  return (
    <div className="fridge mt-4">
      <div className="fridge-pick">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (found[0] !== undefined) pick(found[0]);
          }}
        >
          <label htmlFor="zutat" className="sr-only">
            Zutat suchen
          </label>
          <input
            id="zutat"
            className="field w-full"
            placeholder="Zutat suchen, etwa Zucchini"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </form>
        {found.length > 0 && (
          <ul className="fridge-found" aria-label="Gefundene Zutaten">
            {found.map((food) => (
              <li key={food}>
                <button type="button" className="fridge-found-row" onClick={() => pick(food)}>
                  {foods[food]}
                  <span className="text-sm text-muted tabular-nums">{counts[food]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {there.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Ist noch da">
            {there.map((food) => (
              <button
                key={food}
                type="button"
                className="chip chip-on"
                onClick={() => toggle(food)}
                aria-label={`${foods[food]} entfernen`}
              >
                {foods[food]}
                <CloseIcon />
              </button>
            ))}
            {there.length > 1 && (
              <button
                type="button"
                className="link link-quiet min-h-11 px-1 text-sm"
                onClick={() => write([])}
              >
                Alle entfernen
              </button>
            )}
          </div>
        )}

        <p className="eyebrow mt-4">Oft in euren Rezepten</p>
        <div
          className="mt-1.5 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Oft in euren Rezepten"
        >
          {offered.map((food) => (
            <button key={food} type="button" className="chip" onClick={() => toggle(food)}>
              {foods[food]}
            </button>
          ))}
        </div>
      </div>

      <section aria-label="Passende Rezepte" className="min-w-0">
        <p className="text-muted" role="status">
          {there.length === 0
            ? "Tippt an, was noch da ist."
            : matches.length === 0
              ? "Kein Rezept braucht das."
              : matches.length === LISTED
                ? `Die ${LISTED} Rezepte, die am meisten davon brauchen`
                : matches.length === 1
                  ? "1 Rezept braucht etwas davon"
                  : `${matches.length} Rezepte brauchen etwas davon`}
        </p>
        <ul className="mt-2">
          {matches.map(({ recipe, have, missing }) => (
            <li key={recipe.id}>
              <Link
                href={`/rezepte/${recipe.id}${FROM_FRIDGE}`}
                prefetch
                transitionTypes={[FORWARD]}
                className="list-row"
              >
                <span className={`badge size-12 rounded-xl ${recipe.kind}`}>
                  <PictogramIcon name={recipe.picture} className="h-[68%] w-[68%]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 leading-snug font-semibold">{recipe.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {missing.length === 0
                      ? "Alles da"
                      : `Es fehlt: ${missing
                          .slice(0, NAMED)
                          .map((food) => foods[food])
                          .join(
                            ", ",
                          )}${missing.length > NAMED ? ` und ${missing.length - NAMED} weitere` : ""}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm text-muted tabular-nums">
                  <span className="block font-semibold text-accent">
                    {have.length} von {have.length + missing.length}
                  </span>
                  {recipe.time}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
