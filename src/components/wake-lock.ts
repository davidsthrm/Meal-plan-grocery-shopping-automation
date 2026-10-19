"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active`, where the browser can: nobody wants to unlock the
 * phone between two shelves, or with floury hands at the stove. The browser lets go when
 * the app goes to the background; it is asked again when it comes back. Used by the view
 * for the shop and the view for cooking.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let over = false;
    const take = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const taken = await navigator.wakeLock.request("screen");
        if (over) void taken.release();
        else lock = taken;
      } catch {
        // Refused (battery saver, no permission): the screen dims as it always does.
      }
    };
    void take();
    document.addEventListener("visibilitychange", take);
    return () => {
      over = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release();
    };
  }, [active]);
}
