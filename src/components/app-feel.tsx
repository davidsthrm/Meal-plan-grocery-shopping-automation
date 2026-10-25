"use client";

import { useEffect } from "react";
import { LogoMark } from "./logo";

/** Narrower than this on its short side, a screen is a phone's: it stays upright. */
const PHONE_SHORT_SIDE = 600;

/**
 * What makes the app behave like an installed one rather than a web page: a phone keeps it
 * upright, and no finger zooms into it. The viewport says "no zoom" too (root layout), but
 * Safari ignores that for pinching; its own gesture events are stopped here instead. The
 * map of the supermarkets zooms by itself (Leaflet) and is left alone.
 */
export function AppFeel() {
  useEffect(() => {
    // Android locks the installed app upright; elsewhere the request is refused, and the
    // page asks to be turned back instead (`TurnUpright`).
    const short = Math.min(window.screen.width, window.screen.height);
    if (short < PHONE_SHORT_SIDE) {
      const orientation = window.screen.orientation as ScreenOrientation & {
        lock?: (to: string) => Promise<void>;
      };
      orientation?.lock?.("portrait").catch(() => {});
    }
    const onMap = (event: Event) =>
      event.target instanceof Element && event.target.closest(".leaflet-container") !== null;
    const stop = (event: Event) => {
      if (!onMap(event)) event.preventDefault();
    };
    // Two fingers that pinch: `scale` is Safari's, other browsers keep to `touch-action`.
    const pinch = (event: TouchEvent) => {
      const scale = (event as TouchEvent & { scale?: number }).scale;
      if (scale !== undefined && scale !== 1 && !onMap(event)) event.preventDefault();
    };
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    document.addEventListener("touchmove", pinch, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", pinch);
    };
  }, []);
  return null;
}

/**
 * Shown instead of the app while a phone is held across (`.turn-upright`): the app is made
 * for a phone held upright, and an iPhone cannot be told to stay so. An iPad turns freely.
 */
export function TurnUpright() {
  return (
    <div className="turn-upright" role="alert">
      <LogoMark className="h-12 w-12" />
      <svg viewBox="0 0 48 48" aria-hidden className="turn-upright-phone">
        <rect x="15" y="5" width="18" height="38" rx="4" />
        <path d="M21 9h6" />
        <path d="M6 30a18 18 0 0 0 9 10M42 18a18 18 0 0 0-9-10" />
        <path d="M5 25l1 5 5-1M43 23l-1-5-5 1" />
      </svg>
      <p className="text-lg font-semibold">Bitte das Handy hochkant halten.</p>
    </div>
  );
}
