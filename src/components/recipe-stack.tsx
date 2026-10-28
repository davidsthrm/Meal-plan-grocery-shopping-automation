"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { decideInStack, type StackDecision } from "@/app/(app)/rezepte/actions";
import type { Pictogram } from "@/domain/library/pictogram";
import { FROM_STACK } from "@/lib/origin";
import { FORWARD } from "@/lib/transitions";
import { CloseIcon, HeartIcon } from "./icons";
import { PictogramIcon } from "./pictogram";

/** A recipe of the stack as its card shows it. */
export interface StackCard {
  id: string;
  title: string;
  category: string;
  /** The colour class of its kind ("kind-fish"). */
  kind: string;
  picture: Pictogram;
  /** "Passt zur Saison: Kürbis", or nothing. */
  why: string | null;
  /** "30 Min. · Speed Cooking". */
  facts: string;
  tags: string[];
  /** What is in it, without what is always at home. */
  ingredients: string[];
}

type Way = "right" | "left" | "up";
const DECISION: Record<Way, "keep" | "skip" | "plan"> = { right: "keep", left: "skip", up: "plan" };

/** How far a swipe must be going, as a share of the card, to decide. */
const DECIDES = 0.45;
/** Apple's deceleration of a flick: where a swipe would come to rest. */
const DECELERATION = 0.99;
const project = (velocity: number) => ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
/** Apple's rubber band: the further past where it may go, the less the card follows. */
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** A finger that moved less than this tapped the card. */
const TAP = 8;
/** How long a card takes to fly off or come back, as the house's quick moves. */
const FLY_MS = 240;

/**
 * The recipe stack: one card at a time, to keep (a swipe to the right: on the wish list), to
 * put aside for a few weeks (to the left) or to plan (upwards). The card follows the finger
 * from where it was taken, and the swipe decides by where it would come to rest, not by
 * where the finger let go. A tap opens the recipe. The three decisions are buttons as well,
 * and the arrow keys; "Zurück" takes the last one back, and the card comes back the way it
 * went. Asked for less motion, cards only fade.
 */
export function RecipeStack({ cards }: { cards: StackCard[] }) {
  const router = useRouter();
  // The stack as it was dealt: what is decided is not dealt again until the page is read anew.
  const [deck] = useState(cards);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<{ id: string; way: Way }[]>([]);
  const [failed, setFailed] = useState(false);
  const [returning, setReturning] = useState<Way | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    moved: boolean;
    trail: { x: number; y: number; t: number }[];
  } | null>(null);
  const flying = useRef(false);
  const still = useRef(false);

  useEffect(() => {
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const place = (card: HTMLElement, dx: number, dy: number, animate: boolean) => {
    card.style.transition = animate
      ? `transform ${FLY_MS}ms var(--ease-out), opacity ${FLY_MS}ms ease`
      : "none";
    card.style.transform = still.current ? "" : `translate(${dx}px, ${dy}px) rotate(${dx / 22}deg)`;
    const width = card.offsetWidth || 1;
    // The stamp of where the card is going, stronger the nearer it is to deciding.
    const share = (value: number) => Math.max(0, Math.min(1, value / (width * DECIDES)));
    card.style.setProperty("--keep", String(share(dx)));
    card.style.setProperty("--skip", String(share(-dx)));
    card.style.setProperty("--plan", String(Math.max(0, share(-dy) - share(Math.abs(dx)))));
  };

  const record = useCallback((id: string, decision: StackDecision) => {
    decideInStack(id, decision).catch(() => setFailed(true));
  }, []);

  const decide = useCallback(
    (way: Way) => {
      const card = top.current;
      const recipe = deck[at];
      if (!card || !recipe || flying.current) return;
      flying.current = true;
      setFailed(false);
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const [dx, dy] =
        way === "right"
          ? [width * 1.5, 0]
          : way === "left"
            ? [-width * 1.5, 0]
            : [0, -height * 1.3];
      place(card, dx, dy, true);
      card.style.opacity = "0";
      if (DECISION[way] === "plan") {
        window.setTimeout(
          () => router.push(`/woche?rezept=${recipe.id}`, { transitionTypes: [FORWARD] }),
          still.current ? 0 : FLY_MS - 60,
        );
        return;
      }
      record(recipe.id, DECISION[way] as StackDecision);
      window.setTimeout(
        () => {
          flying.current = false;
          setDone((before) => [...before, { id: recipe.id, way }]);
          setAt((index) => index + 1);
        },
        still.current ? 120 : FLY_MS,
      );
    },
    [at, deck, record, router],
  );

  const undo = () => {
    const last = done.at(-1);
    if (!last || flying.current) return;
    record(last.id, last.way === "right" ? "undo-keep" : "undo-skip");
    setDone((before) => before.slice(0, -1));
    setReturning(last.way);
    setAt((index) => index - 1);
  };

  // A card taken back comes in from where it went, along the same way.
  useLayoutEffect(() => {
    const card = top.current;
    if (!returning || !card) return;
    const width = card.offsetWidth;
    place(card, returning === "right" ? width * 1.5 : -width * 1.5, 0, false);
    card.style.opacity = "0";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        place(card, 0, 0, true);
        card.style.opacity = "1";
        setReturning(null);
      }),
    );
  }, [returning]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === "ArrowRight") decide("right");
      else if (event.key === "ArrowLeft") decide("left");
      else if (event.key === "ArrowUp") {
        event.preventDefault();
        decide("up");
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [decide]);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (flying.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      trail: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }],
    };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const grab = drag.current;
    if (!grab) return;
    const dx = event.clientX - grab.x;
    const dy = event.clientY - grab.y;
    if (!grab.moved && Math.hypot(dx, dy) < TAP) return;
    grab.moved = true;
    grab.trail = [
      ...grab.trail.slice(-4),
      { x: event.clientX, y: event.clientY, t: event.timeStamp },
    ];
    // 1:1 with the finger, from where the card was taken. Downwards means nothing: there the
    // card gives less and less, as at the edge of a list.
    const card = event.currentTarget;
    place(card, dx, dy < 0 ? dy : rubberband(dy, card.offsetHeight), false);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const grab = drag.current;
    drag.current = null;
    if (!grab) return;
    const card = event.currentTarget;
    if (!grab.moved) {
      router.push(`/rezepte/${deck[at].id}${FROM_STACK}`, { transitionTypes: [FORWARD] });
      return;
    }
    const first = grab.trail[0];
    const last = grab.trail.at(-1)!;
    const time = Math.max(1, last.t - first.t);
    const dx = event.clientX - grab.x;
    const dy = event.clientY - grab.y;
    // Where the swipe is going, not where the finger let go.
    const restX = dx + project(((last.x - first.x) / time) * 1000);
    const restY = dy + project(((last.y - first.y) / time) * 1000);
    const width = card.offsetWidth;
    if (restX > width * DECIDES) decide("right");
    else if (restX < -width * DECIDES) decide("left");
    else if (restY < -width * DECIDES && Math.abs(restX) < width * DECIDES) decide("up");
    else place(card, 0, 0, true);
  };

  const left = deck.length - at;
  const kept = done.filter((entry) => entry.way === "right").length;

  return (
    <div className="stack">
      <div className="stack-deck">
        {left === 0 ? (
          <div className="stack-empty">
            <p className="text-lg font-semibold">Alle Karten durch.</p>
            <p className="mt-1 text-muted">Morgen liegt der Stapel neu gemischt.</p>
            {kept > 0 && (
              <Link href="/favoriten" className="btn btn-primary mt-4">
                {kept === 1 ? "1 Wunsch" : `${kept} Wünsche`} ansehen
              </Link>
            )}
          </div>
        ) : (
          deck.slice(at, at + 3).map((card, depth) => (
            <div
              key={card.id}
              ref={depth === 0 ? top : undefined}
              className={`stack-card ${card.kind}`}
              data-depth={depth}
              style={{ zIndex: 3 - depth }}
              aria-hidden={depth > 0 || undefined}
              onPointerDown={depth === 0 ? down : undefined}
              onPointerMove={depth === 0 ? move : undefined}
              onPointerUp={depth === 0 ? up : undefined}
              onPointerCancel={depth === 0 ? () => (drag.current = null) : undefined}
            >
              <span className="stack-stamp stack-stamp-keep" aria-hidden>
                Vormerken
              </span>
              <span className="stack-stamp stack-stamp-skip" aria-hidden>
                Nicht jetzt
              </span>
              <span className="stack-stamp stack-stamp-plan" aria-hidden>
                Einplanen
              </span>
              <PictogramIcon name={card.picture} className="stack-picture" />
              <div className="relative flex min-h-0 flex-1 flex-col">
                <p className="eyebrow">{card.category}</p>
                <h2 className="stack-title mt-1">{card.title}</h2>
                {card.why && <p className="mt-2 font-semibold text-accent">{card.why}</p>}
                {card.tags.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Stichworte">
                    {card.tags.map((tag) => (
                      <li key={tag} className="tag bg-surface">
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
                {card.ingredients.length > 0 && (
                  // What is in it decides it more than anything: the card has room for it.
                  <div className="mt-4 min-h-0">
                    <p className="eyebrow">Zutaten</p>
                    <p className="stack-ingredients mt-1">{card.ingredients.join(" · ")}</p>
                  </div>
                )}
                <p className="mt-auto pt-3 text-muted">{card.facts}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="stack-actions" role="group" aria-label="Entscheiden">
        <button
          type="button"
          className="stack-button stack-button-skip"
          onClick={() => decide("left")}
          disabled={left === 0}
        >
          <span aria-hidden>
            <CloseIcon />
          </span>
          Nicht jetzt
        </button>
        <button
          type="button"
          className="stack-button stack-button-plan"
          onClick={() => decide("up")}
          disabled={left === 0}
        >
          <span aria-hidden>↑</span>
          Einplanen
        </button>
        <button
          type="button"
          className="stack-button stack-button-keep"
          onClick={() => decide("right")}
          disabled={left === 0}
        >
          <span aria-hidden>
            <HeartIcon filled />
          </span>
          Vormerken
        </button>
      </div>

      <p className="stack-foot" aria-live="polite">
        {failed ? (
          <span className="font-semibold text-warn">Nicht gespeichert. Bitte noch einmal.</span>
        ) : (
          <span className="text-muted tabular-nums">
            {left === 1 ? "1 Karte" : `${left} Karten`} · {kept} vorgemerkt
          </span>
        )}
        {done.length > 0 && (
          <button type="button" className="link link-quiet min-h-11 px-2" onClick={undo}>
            Zurück
          </button>
        )}
      </p>
    </div>
  );
}
