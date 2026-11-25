"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

/** Whether whoever is looking asked for less motion. */
export function lessMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const Close = createContext<() => void>(() => {});

/** Closes the sheet this is in, the way its own button does: what is done in it is done. */
export function useCloseSheet(): () => void {
  return useContext(Close);
}

/** The `tablet` variant of `globals.css`: an iPad either way, a laptop, not a phone across. */
const TABLET = "(width >= 46rem) and (height >= 30rem)";

/**
 * A sheet from the foot of the screen over the dimmed page: what was bought instead on a
 * note, or what can be done with a meal of the week. It comes from below and goes back down;
 * pulled down by its top, it follows the finger and goes once let go on its way down.
 *
 * Given an `anchor`, from the tablet width on it is a panel that hangs at the anchor
 * instead, below it where it fits, else above it, never past the screen's edges, as the menu
 * of a row places itself: a sheet across the whole width of an iPad or a laptop was far from
 * the pen that opened it (decided on 25 November 2026). A tap beside it or Escape closes it
 * either way; inside it, Tab goes from row to row and stays there.
 */
export function ActionSheet({
  title,
  closeLabel = "Abbrechen",
  anchor,
  still = false,
  onClose,
  children,
}: {
  title: string;
  closeLabel?: string;
  anchor?: HTMLElement | null;
  /** Opened again as it was, after the page came back: without its entrance. */
  still?: boolean;
  onClose: () => void;
  /** What it holds; `useCloseSheet` closes it from there. */
  children: ReactNode;
}) {
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

  // Opened before it is drawn, and placed at its anchor on a wide screen, so that it does
  // not show at the foot first.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    if (!anchor) return;
    const wide = window.matchMedia(TABLET);
    const place = () => {
      if (!wide.matches) {
        delete element.dataset.atAnchor;
        element.style.top = element.style.left = element.style.transformOrigin = "";
        return;
      }
      element.dataset.atAnchor = "";
      const at = anchor.getBoundingClientRect();
      const { innerWidth, innerHeight } = window;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const below = at.bottom + 4 + height <= innerHeight - 8 || innerHeight - at.bottom >= at.top;
      const top = below ? at.bottom + 4 : at.top - 4 - height;
      element.style.top = `${Math.max(8, Math.min(top, innerHeight - 8 - height))}px`;
      element.style.left = `${Math.max(12, Math.min(at.right - width, innerWidth - 12 - width))}px`;
      // It grows out of the anchor's corner.
      element.style.transformOrigin = below ? "top right" : "bottom right";
    };
    place();
    // Placed again when its rows unfold, the page scrolls under it or the screen turns.
    const grows = new ResizeObserver(place);
    grows.observe(element);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    wide.addEventListener("change", place);
    return () => {
      grows.disconnect();
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      wide.removeEventListener("change", place);
    };
  }, [anchor]);

  // Pulled down by its top, it follows the finger. Not the panel at its anchor.
  useEffect(() => {
    const handle = grip.current;
    const element = dialog.current;
    if (!handle || !element) return;
    let start: { y: number; t: number; id: number } | null = null;
    let last = { y: 0, t: 0 };
    const down = (event: PointerEvent) => {
      if ((event.target as Element).closest("button")) return;
      if (element.dataset.atAnchor !== undefined) return;
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

  return (
    <dialog
      ref={dialog}
      className="action-sheet"
      aria-label={title}
      data-still={still || undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // A tap beside the sheet, on the dimmed page.
        if (event.target === dialog.current) close();
      }}
    >
      <div className="action-sheet-body">
        <div ref={grip} className="action-sheet-head">
          <span className="action-sheet-grip" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-lg font-bold tracking-tight">{title}</h2>
            <button type="button" className="btn btn-small shrink-0" onClick={close}>
              {closeLabel}
            </button>
          </div>
        </div>
        <Close value={close}>{children}</Close>
      </div>
    </dialog>
  );
}
