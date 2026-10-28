"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Pictogram } from "@/domain/library/pictogram";
import { comboKey, spin, type Combination, type Held } from "@/domain/library/roulette";
import type { Effort } from "@/domain/library/tags";
import { FROM_ROULETTE } from "@/lib/origin";
import { FORWARD } from "@/lib/transitions";
import { DiceIcon } from "./icons";
import { PictogramIcon } from "./pictogram";

/** A recipe as the roulette lists it. */
export interface RouletteRecipe {
  title: string;
  kind: string;
  picture: Pictogram;
  time: string | null;
}

/** A value of a reel as it is shown: its name and its sign. */
export interface ReelFace {
  name: string;
  picture: Pictogram;
}

type Reel = "main" | "cuisine" | "effort";
const REELS: { reel: Reel; label: string }[] = [
  { reel: "main", label: "Hauptzutat" },
  { reel: "cuisine", label: "Küche" },
  { reel: "effort", label: "Aufwand" },
];
/** When each reel stops, one after the other. */
const STOPS_MS = [520, 760, 1000];
const TURN_MS = 70;
/** How many of the combination's recipes are listed. */
const LISTED = 8;

/**
 * The recipe roulette: three reels stop on a main ingredient, a cuisine and an effort that
 * have meals behind them, and the meals are listed below. A tap on a reel holds it. The
 * combination is kept in the address, so that the way back from a recipe finds it again.
 */
export function RecipeRoulette({
  combos,
  faces,
  recipes,
  initial,
}: {
  combos: Combination[];
  /** Per tag or effort, how it is shown. */
  faces: Record<string, ReelFace>;
  recipes: Record<string, RouletteRecipe>;
  initial: string | null;
}) {
  // From the address where there is one: stepping back to this page shows it from the
  // router's memory, drawn before the spin, while the address kept what it stopped on.
  const [shown, setShown] = useState<Combination | null>(() => {
    const key =
      typeof window === "undefined"
        ? initial
        : (new URLSearchParams(window.location.search).get("k") ?? initial);
    return combos.find((combo) => comboKey(combo) === key) ?? combos[0] ?? null;
  });
  const [held, setHeld] = useState<Held>({});
  // While spinning: what each reel shows for a moment, and which have stopped.
  const [turning, setTurning] = useState<Partial<Record<Reel, string>> | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const keep = (combo: Combination) => {
    setShown(combo);
    const url = new URL(window.location.href);
    url.searchParams.set("k", comboKey(combo));
    window.history.replaceState(window.history.state, "", url);
  };

  const turn = () => {
    const next = spin(combos, held, Math.random(), shown && comboKey(shown));
    if (!next) return;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      keep(next);
      return;
    }
    // Each reel runs through its own values and stops in turn, left to right.
    const values = (reel: Reel) => [...new Set(combos.map((combo) => combo[reel]))];
    const started = performance.now();
    const step = () => {
      const passed = performance.now() - started;
      const face: Partial<Record<Reel, string>> = {};
      REELS.forEach(({ reel }, at) => {
        if (held[reel] !== undefined || passed >= STOPS_MS[at]) return;
        const own = values(reel);
        face[reel] = own[Math.floor(Math.random() * own.length)];
      });
      if (passed >= STOPS_MS[STOPS_MS.length - 1]) {
        setTurning(null);
        keep(next);
        return;
      }
      setTurning(face);
      // Stopped reels already show where the spin ends.
      setShown((before) => before && { ...before, ...stoppedOf(next, passed) });
      timers.current.push(window.setTimeout(step, TURN_MS));
    };
    step();
  };

  const toggle = (reel: Reel) => {
    if (!shown) return;
    setHeld((before) => {
      const after = { ...before };
      if (after[reel] !== undefined) delete after[reel];
      else (after as Record<Reel, string>)[reel] = shown[reel];
      return after;
    });
  };

  if (!shown) {
    return (
      <p className="mt-6 text-muted">
        Für das Roulette brauchen die Rezepte Stichworte zu Hauptzutat, Küche und Aufwand.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="roulette">
        <div className="roulette-reels">
          {REELS.map(({ reel, label }) => {
            const value = turning?.[reel] ?? shown[reel];
            const face = faces[value];
            const isHeld = held[reel] !== undefined;
            return (
              <button
                key={reel}
                type="button"
                className="roulette-reel"
                data-turning={turning?.[reel] !== undefined}
                aria-pressed={isHeld}
                aria-label={`${label}: ${face?.name}${isHeld ? ", gehalten" : ""}`}
                onClick={() => toggle(reel)}
              >
                <span className="eyebrow">{isHeld ? `${label} · gehalten` : label}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {face && (
                    <span className="badge size-10 rounded-xl">
                      <PictogramIcon name={face.picture} className="h-[68%] w-[68%]" />
                    </span>
                  )}
                  <span className="line-clamp-2 leading-tight font-bold hyphens-auto sm:text-lg">
                    {face?.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary roulette-spin" onClick={turn}>
          <DiceIcon />
          Drehen
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">Antippen hält eine Rolle fest.</p>

      <section aria-label="Passende Rezepte" className="mt-5" aria-busy={turning !== null}>
        <p className="text-muted" role="status">
          {turning
            ? "…"
            : shown.recipes.length === 1
              ? "1 Rezept"
              : `${shown.recipes.length} Rezepte`}
        </p>
        <ul className={`roulette-results mt-1 ${turning ? "opacity-40" : ""}`}>
          {shown.recipes.slice(0, LISTED).map((id) => {
            const recipe = recipes[id];
            if (!recipe) return null;
            return (
              <li key={id}>
                <Link
                  href={`/rezepte/${id}${FROM_ROULETTE}`}
                  prefetch
                  transitionTypes={[FORWARD]}
                  className="list-row"
                >
                  <span className={`badge size-12 rounded-xl ${recipe.kind}`}>
                    <PictogramIcon name={recipe.picture} className="h-[68%] w-[68%]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 leading-snug font-semibold">{recipe.title}</span>
                    {recipe.time && (
                      <span className="mt-0.5 block text-sm text-muted">{recipe.time}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** The reels of a spin that have stopped by now, showing where it ends. */
function stoppedOf(next: Combination, passed: number): Partial<Combination> {
  const stopped: Partial<Record<Reel, string>> = {};
  REELS.forEach(({ reel }, at) => {
    if (passed >= STOPS_MS[at]) stopped[reel] = next[reel];
  });
  return stopped as Partial<Combination> & { effort?: Effort };
}
