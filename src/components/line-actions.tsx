"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { addDays, type IsoDate } from "@/domain/dates";
import { formatAmount, formatNumber } from "@/domain/shopping-list/format";
import {
  isBought,
  leavesNote,
  moveDays,
  moveStartDay,
  nextMoveDay,
  type Decision,
  type PlannedLine,
} from "@/domain/shopping-list/decisions";
import { windowProblems, type LineWindow } from "@/domain/shopping-list/change-day";
import type { ShopChoice } from "@/domain/shopping-list/shop-choice";
import { noteId, readNoteId, type ShoppingTrip } from "@/domain/shopping-list/trips";
import { convert, type Amount, type Unit } from "@/domain/units";
import { dayName, PLACE_LOOK, problemText } from "@/lib/list-text";
import { MoveIcon, PenIcon, ShelfIcon, TickIcon, TrashIcon, UndoIcon } from "./icons";
import { SubmitButton } from "./submit-button";
import { PictogramIcon } from "./pictogram";
import { ShopLogo } from "./shop-logo";
import { decide, deviceId, TickButton, useDecisions, type NotePage, type PageLine } from "./ticks";

/**
 * What can happen to a line in the shop besides a tick, with one hand on the trolley: the
 * bin removes it ("nicht kaufen"), the pen says what was bought instead (three of six, or
 * Geramont for Bavaria Blu), the arrow buys it on another day or in another shop. A swipe
 * to the right buys it, one to the left removes it, and holding a row opens the same as a
 * menu. Every one of them is decided on the device first, like a tick, so it works without
 * a connection and two people shopping at once never undo each other (`decide`); each can
 * be taken back for a few seconds from the bar at the foot. On a note that is planned and
 * looked over at home, the shelf takes the bin's place: what is at home is not bought
 * ("Haben wir schon", a form like any other), and nothing else is taken off a note there
 * but a line someone wrote by hand.
 */

/** The line as the plan has it, for the history of where it is bought. */
export type About = { planned: PlannedLine; item: string; shop: string | null };

/** A line as the actions need it. */
export interface ActionLine extends PageLine {
  /** The name: "Eier". */
  label: string;
  /** The line as it reads on the note: "10x Eier". */
  text: string;
  /** The amount the plan buys, in its unit. Null for a line without one. */
  purchase: Amount | null;
  /** The units an amount bought can be given in, the line's own first. */
  units: Unit[];
  about: About;
  /** Ids of the shops to offer for it (`suggestShops`), and of those behind "Alle". */
  suggested: string[];
  others: string[];
  /** False on the drugstore's note: its lines are not bought on another note. */
  movable: boolean;
  /** When its meals need it and how long it keeps: what a move warns of. Null: any day. */
  window: LineWindow | null;
  /** Said after the name, small: the shop it was named for ("Bäcker"). */
  hint?: string | null;
}

type Sheet =
  | { kind: "edit"; line: ActionLine }
  | {
      kind: "move";
      line: ActionLine;
      rest?: { bought: Amount; rest: Amount; name: string | null };
    };

interface Toast {
  id: number;
  text: string;
  undo: (() => void) | null;
}

interface Host {
  page: NotePage;
  note: ShoppingTrip;
  today: IsoDate;
  choices: ShopChoice[];
  open(sheet: Sheet): void;
  menu(line: ActionLine, anchor: DOMRect, choices: MenuChoices): void;
  /** Decides, and offers to take it back: to `before`, what the line showed until now. */
  act(
    line: Pick<ActionLine, "key" | "about">,
    decision: Decision,
    before: Decision,
    text: string | null,
  ): void;
}

/** What a row's menu offers besides buying, moving and changing it. */
interface MenuChoices {
  /** "Haben wir schon", on a food note. */
  atHome: (() => void) | null;
  /** "Entfernen": in the shop, and on a note for a line written by hand. */
  remove: boolean;
}

const HostContext = createContext<Host | null>(null);

function useHost(): Host {
  const host = useContext(HostContext);
  if (!host) throw new Error("A line's actions need LineActions around them.");
  return host;
}

/** How long a decision can be taken back from the bar at the foot. */
const UNDO_MS = 5000;

/** How long a finger rests on a row before its menu opens. */
const PRESS_MS = 450;

/** How far a finger moves before it is a swipe or a scroll, not a tap. */
const SLOP = 10;

/** "Mo 19.", or "Heute", "Morgen", "Übermorgen" for the days around today. */
function dayWord(date: IsoDate, today: IsoDate): string {
  if (date === today) return "Heute";
  if (date === addDays(today, 1)) return "Morgen";
  if (date === addDays(today, 2)) return "Übermorgen";
  return dayName(date);
}

/** The amount of a decision as a line says it: "3 von 6", "Geramont statt Bavaria Blu". */
export function outcomeText(line: Pick<ActionLine, "label" | "purchase">, decision: Decision) {
  if (decision.kind !== "bought" && decision.kind !== "partial") return "";
  const parts: string[] = [];
  if (decision.name) parts.push(`${decision.name} statt ${line.label}`);
  const amount = decision.amount;
  if (amount && line.purchase && amount.unit === line.purchase.unit) {
    if (amount.quantity !== line.purchase.quantity) {
      parts.push(`${formatNumber(amount.quantity)} von ${formatAmount(line.purchase)}`);
    }
  } else if (amount) {
    parts.push(`${formatAmount(amount)} gekauft`);
  }
  if (decision.kind === "partial") {
    parts.push(
      decision.remainder.kind === "discarded"
        ? "Rest nicht gekauft"
        : restTo(decision.remainder.to),
    );
  }
  return parts.join(" · ");
}

/** Where the rest of a line went: "Rest → Di 20.", or only that it went. */
function restTo(to: string): string {
  const trip = readNoteId(to);
  return trip ? `Rest → ${dayName(trip.date)}` : "Rest verschoben";
}

/** What the planned amount less the bought one leaves, where both are in units that convert. */
function restAfter(planned: Amount | null, bought: Amount): Amount | null {
  if (!planned) return null;
  const inPlanned = convert(bought.quantity, bought.unit, planned.unit);
  if (inPlanned === null || inPlanned >= planned.quantity) return null;
  return { quantity: Math.round((planned.quantity - inPlanned) * 1000) / 1000, unit: planned.unit };
}

/** Whether whoever is looking asked for less motion. */
function lessMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The actions of the lines of one note: their menu, their two sheets and the bar to take
 * a decision back. One of each for the whole note, opened for the line they are about.
 */
export function LineActions({
  page,
  note,
  today,
  choices,
  children,
}: {
  page: NotePage;
  note: ShoppingTrip;
  today: IsoDate;
  choices: ShopChoice[];
  children: ReactNode;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [menu, setMenu] = useState<{
    line: ActionLine;
    anchor: DOMRect;
    choices: MenuChoices;
  } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const act = useCallback<Host["act"]>(
    (line, decision, before, text) => {
      void decide(page, line.key, decision, line.about).then(({ refused }) => {
        if (!refused) return;
        setToast({
          id: Date.now(),
          text: `${line.about.planned.name}: nicht gespeichert, bitte noch einmal`,
          undo: null,
        });
      });
      if (text === null) return;
      setToast({
        id: Date.now(),
        text,
        undo: () => void decide(page, line.key, before, line.about),
      });
    },
    [page],
  );

  const closeMenu = useCallback(() => setMenu(null), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const doneToast = useCallback(() => setToast(null), []);

  const host = useMemo<Host>(
    () => ({
      page,
      note,
      today,
      choices,
      open: setSheet,
      menu: (line, anchor, choices) => setMenu({ line, anchor, choices }),
      act,
    }),
    [page, note, today, choices, act],
  );

  return (
    <HostContext.Provider value={host}>
      {children}
      {menu && <RowMenu key={menu.line.key} {...menu} onClose={closeMenu} />}
      {sheet && (
        <ActionSheet
          key={`${sheet.kind}-${sheet.line.key}-${sheet.kind === "move" && sheet.rest ? "rest" : ""}`}
          sheet={sheet}
          onClose={closeSheet}
        />
      )}
      <UndoBar toast={toast} onDone={doneToast} />
    </HostContext.Provider>
  );
}

/**
 * The same actions once more, inside a view over the whole screen: a modal dialog makes
 * everything outside it inert, so the menu and the bar of the note would not answer there.
 */
export function LineActionsHere({ children }: { children: ReactNode }) {
  const { page, note, today, choices } = useHost();
  return (
    <LineActions page={page} note={note} today={today} choices={choices}>
      {children}
    </LineActions>
  );
}

/** The decision a line shows on this device, and what to do about it. */
function useLine(line: ActionLine) {
  const host = useHost();
  const [decision] = useDecisions(host.page, [line]);
  const bought = isBought(decision);
  const toggle = () =>
    host.act(line, bought ? { kind: "open" } : { kind: "bought" }, decision, null);
  const remove = () => host.act(line, { kind: "removed" }, decision, `${line.label} entfernt`);
  return { host, decision, bought, toggle, remove };
}

/**
 * Follows a finger on a row: a swipe to the right buys, one to the left removes (on a note:
 * says it is at home), a finger held still opens the menu. The row moves with the finger the
 * whole way; let go, it goes where the finger was heading, judged by how fast it was moving,
 * not only where it is.
 */
function useRowGesture(
  row: React.RefObject<HTMLElement | null>,
  face: React.RefObject<HTMLElement | null>,
  /** `left` returns false when nothing happened: the row then comes back. */
  handlers: { right: () => void; left: () => boolean | void; press: () => void },
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const element = row.current;
    const moving = face.current;
    if (!element || !moving) return;
    let start: { x: number; y: number; id: number } | null = null;
    let mode: "idle" | "pending" | "swipe" | "pressed" = "idle";
    let offset = 0;
    let history: { x: number; t: number }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let swallowClick = false;

    const place = (x: number, animate: boolean) => {
      offset = x;
      moving.style.transition =
        animate && !lessMotion() ? "transform 200ms var(--ease-out)" : "none";
      moving.style.transform = x === 0 ? "" : `translateX(${x}px)`;
      element.dataset.swipe = x > 0 ? "right" : x < 0 ? "left" : "";
    };
    // Past a third of the row it follows less, as a thing pulled beyond where it gives.
    const resist = (dx: number, width: number) => {
      const free = width * 0.45;
      if (Math.abs(dx) <= free) return dx;
      const over = Math.abs(dx) - free;
      return Math.sign(dx) * (free + (over * width * 0.25) / (width * 0.25 + over));
    };
    const ignored = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest("input, select, textarea, a, details[open] > :not(summary), [data-no-swipe]");

    const down = (event: PointerEvent) => {
      if (event.button !== 0 || ignored(event.target)) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      mode = "pending";
      history = [{ x: event.clientX, t: event.timeStamp }];
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (mode !== "pending") return;
        mode = "pressed";
        swallowClick = true;
        latest.current.press();
      }, PRESS_MS);
    };
    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (mode === "pending") {
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy) * 1.2) {
          mode = "swipe";
          clearTimeout(timer);
          element.setPointerCapture(event.pointerId);
        } else if (Math.abs(dy) > SLOP) {
          mode = "idle";
          clearTimeout(timer);
          start = null;
          return;
        }
      }
      if (mode !== "swipe") return;
      // From where the swipe began, not from where the finger landed: no jump at the start.
      const from = Math.sign(dx) * SLOP;
      place(resist(dx - from, element.offsetWidth), false);
      history = [...history, { x: event.clientX, t: event.timeStamp }].slice(-6);
    };
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      clearTimeout(timer);
      const wasSwipe = mode === "swipe";
      mode = "idle";
      start = null;
      if (!wasSwipe) return;
      swallowClick = true;
      const first = history[0];
      const last = history[history.length - 1];
      const velocity = last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * 1000 : 0;
      // Where the row would come to rest, thrown at that speed (Apple's projection).
      const rate = 0.99;
      const projected = offset + ((velocity / 1000) * rate) / (1 - rate);
      const width = element.offsetWidth;
      const goes = Math.abs(projected) > width * 0.35 && Math.sign(projected) === Math.sign(offset);
      if (goes && offset > 0) {
        place(0, true);
        latest.current.right();
      } else if (goes && offset < 0) {
        place(-width, true);
        window.setTimeout(
          () => {
            if (latest.current.left() === false) place(0, true);
          },
          lessMotion() ? 0 : 180,
        );
      } else {
        place(0, true);
      }
    };
    const cancel = () => {
      clearTimeout(timer);
      if (mode === "swipe") place(0, true);
      mode = "idle";
      start = null;
    };
    const click = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // A long press on Android and a right click say the same.
    const context = (event: MouseEvent) => {
      if (ignored(event.target)) return;
      event.preventDefault();
      clearTimeout(timer);
      if (mode !== "pressed") latest.current.press();
      mode = "idle";
      start = null;
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", cancel);
    element.addEventListener("click", click, true);
    element.addEventListener("contextmenu", context);
    return () => {
      clearTimeout(timer);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", cancel);
      element.removeEventListener("click", click, true);
      element.removeEventListener("contextmenu", context);
    };
  }, [row, face]);
}

/**
 * One line with its actions. In the view for the shop the whole row is the button that buys
 * it; on the note the box does, and the text opens what the line is for (`children`).
 */
export function ActionRow({
  line,
  variant,
  atHome,
  removable = true,
  className = "",
  children,
}: {
  line: ActionLine;
  variant: "store" | "note";
  /**
   * On a food note: the form that says the line is at home, with the fields that name it.
   * Its shelf stands where the bin stands in the shop, and a swipe to the left does it.
   */
  atHome?: { action: (form: FormData) => void | Promise<void>; fields: ReactNode };
  /** Whether the line can be removed. On a note only one written by hand needs to be. */
  removable?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { host, decision, bought, toggle, remove } = useLine(line);
  const row = useRef<HTMLLIElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const homeForm = useRef<HTMLFormElement>(null);
  const home = variant === "note" && atHome !== undefined;
  // Sent like a tap on the shelf. Without a connection the form is stopped before it goes
  // (the bar at the foot says so), and the row comes back.
  const toHome = () => {
    homeForm.current?.requestSubmit();
    return navigator.onLine;
  };
  useRowGesture(row, face, {
    right: () => {
      if (!bought) toggle();
    },
    left: home ? toHome : remove,
    press: () => {
      if (!row.current) return;
      host.menu(line, row.current.getBoundingClientRect(), {
        atHome: home ? toHome : null,
        remove: !home || removable,
      });
    },
  });

  if (decision.kind === "removed") return null;
  if (decision.kind === "moved" && leavesNote(decision, host.page.note)) {
    const to = readNoteId(decision.to);
    return (
      <li className={`moved-line ${className}`}>
        <span className="min-w-0 flex-1 truncate">{line.label}</span>
        <span className="shrink-0 tabular-nums">→ {to ? dayName(to.date) : ""}</span>
      </li>
    );
  }
  // Another shop on this note: the line stays and says where, until the page has it there.
  const shopNow =
    decision.kind === "moved"
      ? host.choices.find((choice) => choice.shopId && choice.shopId === decision.shopId)
      : undefined;
  const outcome = shopNow ? `bei ${shopNow.name}` : outcomeText(line, decision);
  const actions = (
    <span className="row-actions print:hidden" data-no-swipe>
      {line.movable && (
        <button
          type="button"
          className="icon-button"
          aria-label={`${line.label} verschieben`}
          title="Verschieben"
          onClick={() => host.open({ kind: "move", line })}
        >
          <MoveIcon />
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={`${line.label}: Menge oder Produkt ändern`}
        title="Ändern"
        onClick={() => host.open({ kind: "edit", line })}
      >
        <PenIcon />
      </button>
      {home ? (
        <form ref={homeForm} action={atHome.action} className="contents">
          {atHome.fields}
          <input type="hidden" name="atHome" value="1" />
          <SubmitButton
            className="icon-button"
            label={`${line.label}: haben wir schon`}
            title="Haben wir schon"
          >
            <ShelfIcon />
          </SubmitButton>
        </form>
      ) : (
        <button
          type="button"
          className="icon-button"
          aria-label={`${line.label} entfernen`}
          title="Entfernen"
          onClick={remove}
        >
          <TrashIcon />
        </button>
      )}
    </span>
  );

  return (
    <li
      ref={row}
      className={`swipe-row ${variant === "note" ? "tick-line" : ""} ${className}`}
      data-at-home={home || undefined}
    >
      <span className="swipe-under" aria-hidden>
        <span className="swipe-buy">
          <TickIcon />
          Gekauft
        </span>
        <span className="swipe-remove">
          {home ? "Haben wir schon" : "Entfernen"}
          {home ? <ShelfIcon /> : <TrashIcon />}
        </span>
      </span>
      <div ref={face} className="swipe-face">
        {variant === "store" ? (
          <button
            type="button"
            className="store-row min-w-0 flex-1 border-0"
            aria-pressed={bought}
            data-on={bought}
            onClick={toggle}
          >
            <span className="tickbox tickbox-large" data-on={bought} aria-hidden>
              <TickIcon />
            </span>
            <span className="min-w-0">
              <span className="store-text block">
                {line.text}
                {line.hint && <span className="text-muted"> · {line.hint}</span>}
              </span>
              {outcome && <span className="block text-sm text-muted">{outcome}</span>}
            </span>
          </button>
        ) : (
          <>
            <TickButton
              page={host.page}
              line={line}
              label={line.text}
              about={line.about}
              className="print:hidden"
            />
            <span
              aria-hidden
              className="mt-1 hidden size-3 shrink-0 border border-black print:block"
            />
            <div className="min-w-0 flex-1">
              {children}
              {outcome && <p className="-mt-1 mb-1 text-sm text-muted print:hidden">{outcome}</p>}
            </div>
          </>
        )}
        {actions}
      </div>
    </li>
  );
}

/**
 * Something that was on this note and is bought on another one now, quietly: "Eier → Di".
 * A tap on it brings it back.
 */
export function MovedAwayRow({
  line,
  to,
}: {
  line: { key: string; label: string; about: About };
  to: ShoppingTrip;
}) {
  const host = useHost();
  const page: PageLine = {
    key: line.key,
    checked: false,
    decision: { kind: "moved", to: noteId(to), shopId: null },
  };
  const [decision] = useDecisions(host.page, [page]);
  const back = decision.kind !== "moved";
  return (
    <li className="moved-line">
      <span className="min-w-0 flex-1 truncate">{line.label}</span>
      {back ? (
        <span className="shrink-0">wird zurückgeholt</span>
      ) : (
        <>
          <span className="shrink-0 tabular-nums">→ {dayName(to.date)}</span>
          <button
            type="button"
            className="icon-button print:hidden"
            aria-label={`${line.label} zurückholen`}
            title="Zurückholen"
            onClick={() =>
              host.act(
                line,
                { kind: "open" },
                page.decision as Decision,
                `${line.label} zurückgeholt`,
              )
            }
          >
            <UndoIcon />
          </button>
        </>
      )}
    </li>
  );
}

/**
 * Something not bought on purpose: removed, or the rest of a line bought in part. "Wieder
 * aufnehmen" puts it back on the note, to buy.
 */
export function NotBoughtRow({
  line,
  amount,
  reason,
}: {
  line: ActionLine;
  /** How much of it was not bought: "3 Stück". */
  amount: string | null;
  reason: string | null;
}) {
  const host = useHost();
  const [decision] = useDecisions(host.page, [line]);
  const page = line.decision ?? { kind: "removed" };
  // Taken back on this device: it stands on the note again.
  if (decision.kind !== page.kind) return null;
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-rule">
      <span className="min-w-0 flex-1">
        {line.label}
        {amount && <span className="text-muted tabular-nums"> · {amount}</span>}
        {reason && <span className="block text-sm text-muted">{reason}</span>}
      </span>
      <button
        type="button"
        className="link min-h-11 shrink-0 text-sm print:hidden"
        onClick={() =>
          host.act(line, { kind: "open" }, decision, `${line.label} wieder auf dem Zettel`)
        }
      >
        Wieder aufnehmen
      </button>
    </li>
  );
}

/** The menu a row opens when a finger rests on it: the same actions, named. */
function RowMenu({
  line,
  anchor,
  choices,
  onClose,
}: {
  line: ActionLine;
  anchor: DOMRect;
  choices: MenuChoices;
  onClose: () => void;
}) {
  const { host, decision, bought, toggle, remove } = useLine(line);
  const menu = useRef<HTMLDivElement>(null);
  // The day after the note, or tomorrow where its day is over.
  const next = nextMoveDay(host.note.date, host.today);
  const nextWord = dayWord(next, host.today);

  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    if (!element.matches(":popover-open")) element.showPopover();
    // Closed by a tap beside it or by Escape. Not by the browser's own light dismiss: the
    // finger that held the row still lifts after the menu opened, and that closed it again.
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) onClose();
    };
    // Escape closes the menu only, not the view for the shop it lies over.
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const listen = window.setTimeout(() => {
      document.addEventListener("pointerdown", outside, true);
    }, 0);
    document.addEventListener("keydown", key, true);
    return () => {
      window.clearTimeout(listen);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  // Below the row where it fits, else above it; from the row's side, as it grows out of it.
  const below = anchor.bottom + 320 < window.innerHeight;
  const style = {
    top: below ? anchor.bottom - 4 : undefined,
    bottom: below ? undefined : window.innerHeight - anchor.top - 4,
    left: Math.min(Math.max(12, anchor.left + 12), window.innerWidth - 290),
    transformOrigin: below ? "top left" : "bottom left",
  };
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  const here = host.choices.find((choice) => choice.id === line.about.shop);

  return (
    <div
      ref={menu}
      popover="manual"
      role="menu"
      className="row-menu"
      style={style}
      aria-label={line.label}
    >
      <p className="row-menu-title">{line.text}</p>
      <button type="button" role="menuitem" onClick={run(toggle)}>
        <TickIcon />
        {bought ? "Wieder offen" : "Gekauft"}
      </button>
      {line.movable && (
        <button
          type="button"
          role="menuitem"
          onClick={run(() =>
            host.act(
              line,
              {
                kind: "moved",
                to: noteId({ date: next, place: host.note.place }),
                shopId: here?.shopId ?? null,
              },
              decision,
              `${line.label} auf ${dayName(next)} verschoben`,
            ),
          )}
        >
          <MoveIcon />
          {nextWord === "Morgen" || nextWord === "Übermorgen"
            ? `${nextWord} kaufen`
            : `Am ${nextWord} kaufen`}
        </button>
      )}
      {line.movable && (
        <button
          type="button"
          role="menuitem"
          onClick={run(() => host.open({ kind: "move", line }))}
        >
          <MoveIcon />
          Verschieben …
        </button>
      )}
      <button type="button" role="menuitem" onClick={run(() => host.open({ kind: "edit", line }))}>
        <PenIcon />
        {line.purchase ? "Nicht alles bekommen …" : "Anderes Produkt …"}
      </button>
      {choices.atHome && (
        <button type="button" role="menuitem" onClick={run(choices.atHome)}>
          <ShelfIcon />
          Haben wir schon
        </button>
      )}
      {choices.remove && (
        <button type="button" role="menuitem" className="text-danger" onClick={run(remove)}>
          <TrashIcon />
          Entfernen
        </button>
      )}
    </div>
  );
}

/** The step a stepper takes for an amount: one piece, 50 g, half a litre. */
function stepOf(unit: Unit, quantity: number): number {
  if (unit === "g" || unit === "ml") return quantity >= 200 ? 50 : 10;
  if (unit === "kg" || unit === "l") return 0.5;
  return 1;
}

/**
 * A sheet from the foot of the screen over the note: what was bought instead, or where it is
 * bought. It comes from below and goes back down; pulled down by its top, it follows the
 * finger and goes once let go on its way down.
 */
function ActionSheet({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const grip = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    const element = dialog.current;
    if (!element?.open) return onClose();
    if (element.classList.contains("going")) return;
    element.classList.add("going");
    window.setTimeout(
      () => {
        element.close();
        onClose();
      },
      lessMotion() ? 0 : 200,
    );
  }, [onClose]);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  // Pulled down by its top, it follows the finger.
  useEffect(() => {
    const handle = grip.current;
    const element = dialog.current;
    if (!handle || !element) return;
    let start: { y: number; t: number; id: number } | null = null;
    let last = { y: 0, t: 0 };
    const down = (event: PointerEvent) => {
      if ((event.target as Element).closest("button")) return;
      start = { y: event.clientY, t: event.timeStamp, id: event.pointerId };
      last = { y: event.clientY, t: event.timeStamp };
      handle.setPointerCapture(event.pointerId);
      element.style.transition = "none";
    };
    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dy = event.clientY - start.y;
      // Upwards it gives a little, and no more.
      const y = dy > 0 ? dy : -Math.sqrt(-dy) * 2;
      element.style.transform = `translateY(${y}px)`;
      last = { y: event.clientY, t: event.timeStamp };
    };
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dy = event.clientY - start.y;
      const velocity = last.t > start.t ? ((last.y - start.y) / (last.t - start.t)) * 1000 : 0;
      start = null;
      const projected = dy + ((velocity / 1000) * 0.99) / 0.01;
      element.style.transition = lessMotion() ? "none" : "transform 200ms var(--ease-out)";
      if (projected > element.offsetHeight * 0.4) {
        element.style.transform = `translateY(${element.offsetHeight}px)`;
        window.setTimeout(
          () => {
            element.close();
            onClose();
          },
          lessMotion() ? 0 : 200,
        );
      } else {
        element.style.transform = "";
      }
    };
    handle.addEventListener("pointerdown", down);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
    return () => {
      handle.removeEventListener("pointerdown", down);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
  }, [onClose]);

  const title =
    sheet.kind === "edit"
      ? sheet.line.label
      : sheet.rest
        ? `Rest: ${formatAmount(sheet.rest.rest)} ${sheet.line.label}`
        : `${sheet.line.label} verschieben`;

  return (
    <dialog
      ref={dialog}
      className="action-sheet"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // A tap beside the sheet, on the dimmed note.
        if (event.target === dialog.current) close();
      }}
    >
      <div className="action-sheet-body">
        <div ref={grip} className="action-sheet-head">
          <span className="action-sheet-grip" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-lg font-bold tracking-tight">{title}</h2>
            <button type="button" className="btn btn-small shrink-0" onClick={close}>
              Abbrechen
            </button>
          </div>
        </div>
        {sheet.kind === "edit" ? (
          <EditForm line={sheet.line} onDone={close} />
        ) : (
          <MoveForm line={sheet.line} rest={sheet.rest} onDone={close} />
        )}
      </div>
    </dialog>
  );
}

/**
 * What was bought: how much of what the plan says ("3 von 6"), and what instead (Geramont
 * for Bavaria Blu). Less than planned asks what becomes of the rest.
 */
function EditForm({ line, onDone }: { line: ActionLine; onDone: () => void }) {
  const { host, decision } = useLine(line);
  const already = decision.kind === "bought" || decision.kind === "partial" ? decision : null;
  const [unit, setUnit] = useState<Unit>(already?.amount?.unit ?? line.purchase?.unit ?? "Stück");
  const [quantity, setQuantity] = useState<number | null>(
    already?.amount?.quantity ?? line.purchase?.quantity ?? null,
  );
  const [name, setName] = useState(already?.name ?? "");
  const step = stepOf(unit, line.purchase?.quantity ?? 1);
  const bought: Amount | null = quantity !== null && quantity > 0 ? { quantity, unit } : null;
  const rest = bought ? restAfter(line.purchase, bought) : null;
  const product = name.trim() === "" || name.trim() === line.label ? null : name.trim();
  const sameAmount =
    !bought ||
    (line.purchase &&
      bought.unit === line.purchase.unit &&
      bought.quantity === line.purchase.quantity);
  const what = product ?? line.label;

  const take = () => {
    host.act(
      line,
      { kind: "bought", amount: sameAmount ? null : bought, name: product },
      decision,
      product ? `${product} statt ${line.label} gekauft` : `${what} gekauft`,
    );
    onDone();
  };
  const discard = () => {
    if (!bought) return;
    host.act(
      line,
      { kind: "partial", amount: bought, name: product, remainder: { kind: "discarded" } },
      decision,
      `${formatAmount(bought)} ${what} gekauft, Rest nicht`,
    );
    onDone();
  };

  return (
    <div className="space-y-5 px-4 pt-2 pb-4">
      {line.purchase && (
        <div>
          <span className="font-semibold">Gekauft</span>
          <span className="mt-2 flex items-center gap-2">
            <span className="stepper">
              <button
                type="button"
                aria-label="Weniger"
                disabled={quantity === null || quantity <= step}
                onClick={() => setQuantity((value) => Math.max(step, (value ?? step) - step))}
              >
                −
              </button>
              <span className="stepper-value min-w-[5.5rem] justify-center text-lg">
                <input
                  aria-label={`Menge von ${line.label}`}
                  inputMode="decimal"
                  className="w-12 bg-transparent text-center"
                  value={quantity === null ? "" : formatNumber(quantity)}
                  onChange={(event) => {
                    const read = Number(event.target.value.replace(",", "."));
                    setQuantity(Number.isFinite(read) && read > 0 ? read : null);
                  }}
                />
                {unit === line.purchase.unit && (
                  <span className="text-muted whitespace-nowrap">
                    von {formatNumber(line.purchase.quantity)}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label="Mehr"
                onClick={() => setQuantity((value) => (value ?? 0) + step)}
              >
                +
              </button>
            </span>
            <select
              aria-label="Einheit"
              className="field w-24"
              value={unit}
              onChange={(event) => setUnit(event.target.value as Unit)}
            >
              {line.units.map((each) => (
                <option key={each} value={each}>
                  {each}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
      <label className="block">
        <span className="font-semibold">Anderes Produkt</span>
        <input
          className="field mt-1"
          maxLength={80}
          autoComplete="off"
          placeholder={`statt ${line.label}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {rest ? (
        <div className="space-y-2">
          <p className="text-muted">
            Es fehlen noch {formatAmount(rest)} {line.label}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn"
              onClick={() =>
                host.open({
                  kind: "move",
                  line,
                  rest: { bought: bought as Amount, rest, name: product },
                })
              }
            >
              Rest verschieben
            </button>
            <button type="button" className="btn" onClick={discard}>
              Rest verwerfen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary w-full" onClick={take}>
          Gekauft
        </button>
      )}
    </div>
  );
}

/**
 * The days offered as chips, in their order: today, tomorrow and the note's own day, made
 * up to three with the days after. The others are in "Datum wählen".
 */
function quickDays(days: readonly IsoDate[], noteDate: IsoDate, today: IsoDate): IsoDate[] {
  const quick = [...new Set([today, addDays(today, 1), noteDate])]
    .filter((each) => days.includes(each))
    .sort();
  for (const each of days) {
    if (quick.length >= 3) break;
    if (quick.length === 0 || each > quick[quick.length - 1]) quick.push(each);
  }
  return quick;
}

/**
 * Where it is bought instead: another day, another shop, or both, decided once. The days
 * from today, also before the note, up to a week after it; the shops that sell it, where it was bought before first, and
 * the others behind "Alle Geschäfte".
 */
function MoveForm({
  line,
  rest,
  onDone,
}: {
  line: ActionLine;
  rest?: { bought: Amount; rest: Amount; name: string | null };
  onDone: () => void;
}) {
  const { host, decision } = useLine(line);
  const { today, note, choices } = host;
  const here =
    choices.find((choice) => choice.id === line.about.shop) ??
    choices.find((choice) => choice.place === note.place);
  const days = moveDays(note.date, today);
  const start = moveStartDay(note.date, today);
  const [day, setDay] = useState<IsoDate>(rest ? nextMoveDay(note.date, today) : start);
  const [shop, setShop] = useState<string | undefined>(here?.id);
  const [all, setAll] = useState(false);
  const picked = choices.find((choice) => choice.id === shop);
  const quick = quickDays(days, note.date, today);
  const later = days.filter((each) => !quick.includes(each));
  const offered = line.suggested.flatMap((id) => choices.find((choice) => choice.id === id) ?? []);
  const others = line.others.flatMap((id) => choices.find((choice) => choice.id === id) ?? []);
  const same = day === note.date && shop === here?.id;

  const target = picked && { date: day, place: picked.place };
  // Said, not stopped: the salad for Sunday may well be bought on Wednesday.
  const warning =
    target && noteId(target) !== noteId(note)
      ? windowProblems(line.window, target, "too-late")[0]
      : undefined;
  const words = [
    day !== note.date ? `auf ${dayName(day)}` : null,
    shop !== here?.id && picked ? `bei ${picked.name}` : null,
  ].filter(Boolean);

  const go = () => {
    if (!target || !picked) return;
    const to = noteId(target);
    if (rest) {
      host.act(
        line,
        {
          kind: "partial",
          amount: rest.bought,
          name: rest.name,
          remainder: {
            kind: "moved",
            to,
            shopId: picked.shopId,
            amount: rest.rest,
            entryId: deviceId(),
          },
        },
        decision,
        `Rest ${words.join(" ")}`,
      );
    } else {
      host.act(
        line,
        { kind: "moved", to, shopId: picked.shopId },
        decision,
        `${line.label} ${words.join(" ")}`,
      );
    }
    onDone();
  };

  const shopRow = (choice: ShopChoice) => (
    <label key={choice.id} className="choice-row">
      <input
        type="radio"
        name="shop"
        value={choice.id}
        checked={shop === choice.id}
        onChange={() => setShop(choice.id)}
        className="sr-only"
      />
      {choice.shopId || choice.logoUrl ? (
        <ShopLogo shop={{ name: choice.name, logoUrl: choice.logoUrl }} size={28} />
      ) : (
        <span className={`badge size-7 ${PLACE_LOOK[choice.place].tone}`}>
          <PictogramIcon name={PLACE_LOOK[choice.place].pictogram} className="h-[70%] w-[70%]" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{choice.name}</span>
      {choice.id === here?.id && <span className="text-sm text-muted">jetzt</span>}
      <span className="choice-check" aria-hidden>
        <TickIcon />
      </span>
    </label>
  );

  return (
    <div className="space-y-5 px-4 pt-2 pb-4">
      <fieldset>
        <legend className="font-semibold">Tag</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {quick.map((each) => (
            <button
              key={each}
              type="button"
              className="chip min-h-11"
              aria-pressed={day === each}
              data-on={day === each}
              onClick={() => setDay(each)}
            >
              {dayWord(each, today)}
            </button>
          ))}
          <label className="chip min-h-11" data-on={later.includes(day)}>
            <span className="sr-only">Datum wählen</span>
            <select
              className="bg-transparent"
              value={later.includes(day) ? day : ""}
              onChange={(event) => event.target.value && setDay(event.target.value)}
            >
              <option value="">Datum wählen</option>
              {later.map((each) => (
                <option key={each} value={each}>
                  {dayName(each)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {warning && <p className="mt-2 text-sm text-warn">{problemText(warning)}</p>}
      </fieldset>
      <fieldset>
        <legend className="font-semibold">Geschäft</legend>
        <div className="mt-1">
          {offered.map((choice) => shopRow(choice))}
          {others.length > 0 && !all && (
            <button type="button" className="link min-h-11" onClick={() => setAll(true)}>
              Alle Geschäfte
            </button>
          )}
          {all && others.map(shopRow)}
        </div>
      </fieldset>
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={same || !target}
        onClick={go}
      >
        {same ? "Tag oder Geschäft wählen" : `${rest ? "Rest" : line.label} ${words.join(" ")}`}
      </button>
    </div>
  );
}

/**
 * The bar at the foot that says what was just decided, with "Widerrufen" for a few seconds.
 * It lies above everything, also above the view for the shop: a popover in the top layer.
 */
function UndoBar({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element || !toast) return;
    // Shown again, it comes above a view that opened since.
    if (element.matches(":popover-open")) element.hidePopover();
    element.showPopover();
    const timer = window.setTimeout(() => {
      element.hidePopover();
      onDone();
    }, UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <div ref={bar} popover="manual" className="undo-bar" role="status" aria-live="polite">
      {toast && (
        <>
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="undo-button"
              onClick={() => {
                toast.undo?.();
                bar.current?.hidePopover();
                onDone();
              }}
            >
              Widerrufen
            </button>
          )}
        </>
      )}
    </div>
  );
}
