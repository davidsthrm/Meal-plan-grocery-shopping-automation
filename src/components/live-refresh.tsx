"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

/** What the household changes together: the plan, the lists, the note, the goals. */
const SHARED = [
  "week_plan",
  "plan_slot",
  "plan_slot_food",
  "plan_extra",
  "shopping_manual_entry",
  "shopping_line_state",
  "restock_item",
  "household",
] as const;

/** Several changes in a row, as one action often makes them, are answered once. */
const SETTLE_MS = 500;
/**
 * How long after a tap on this device a change is taken for its own. The page that comes
 * back from the tap is already up to date, and reading it once more right away would only
 * make the next tap wait. So it is read again once the taps have stopped for this long.
 */
const OWN_MS = 3000;

/**
 * Keeps the page in step with the other devices of the household: when someone plans a
 * meal, ticks a line or writes on the note, every open page reads itself again. Nothing is
 * taken from the message but the fact that something changed, so what a page shows always
 * comes from the server, under the same rules as on a reload.
 *
 * A phone that was asleep may have missed a message. A page that comes back into view, or
 * back online, reads itself again as well.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastOwn = 0;
    // An import stores recipes by the hundred. Its own pages follow it by themselves.
    const quiet = () => window.location.pathname.startsWith("/import");
    const schedule = () => {
      clearTimeout(timer);
      const wait = Math.max(SETTLE_MS, lastOwn + OWN_MS - Date.now());
      timer = setTimeout(() => {
        timer = undefined;
        router.refresh();
      }, wait);
    };
    // Without a connection the page cannot be read again: Next.js would load it as a new
    // page, and the service worker would answer with the copy kept for the shop.
    const changed = () => {
      if (quiet() || document.visibilityState !== "visible" || !navigator.onLine) return;
      schedule();
    };
    // Every button of the app is a form. A tap moves a waiting read behind itself.
    const acted = () => {
      lastOwn = Date.now();
      if (timer !== undefined) schedule();
    };
    const channel = supabase.channel("household");
    for (const table of SHARED) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, changed);
    }
    // Of the recipes only what is changed on one: a favourite, a wish, a correction.
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "recipe" }, changed);
    channel.subscribe();

    const seen = () => {
      if (document.visibilityState === "visible" && !quiet() && navigator.onLine) router.refresh();
    };
    document.addEventListener("visibilitychange", seen);
    // Back online, the page may have missed what the others changed meanwhile.
    window.addEventListener("online", seen);
    document.addEventListener("submit", acted, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
      window.removeEventListener("online", seen);
      document.removeEventListener("submit", acted, true);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
