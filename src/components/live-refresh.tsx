"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  DAILY_TABLES,
  LIBRARY_TABLES,
  quicker,
  refreshAt,
  SEARCHED_TABLES,
  type Pace,
} from "@/lib/live-refresh";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { LIBRARY_CHANGED } from "./live-search";

/**
 * Keeps the page in step with the other devices of the household: when someone plans a
 * meal, ticks a line, writes on the note, marks a favourite, changes a tag or a setting, or
 * joins the family, every open page reads itself again. Nothing is taken from the message
 * but the fact that something changed, so what a page shows always comes from the server,
 * under the same rules as on a reload.
 *
 * A phone that was asleep, or whose connection to Realtime broke off for a while, may have
 * missed a message. A page that comes back into view, back online, or back to Realtime
 * reads itself again as well.
 */
/** How often a read that waits for a form looks again. */
const BUSY_RETRY_MS = 300;

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The burst of changes waiting: since when, and at the quickest pace among them.
    let firstAt = 0;
    let pace: Pace | null = null;
    let lastOwn = -Infinity;
    // An import stores recipes by the hundred. Its own pages follow it by themselves.
    const quiet = () => window.location.pathname.startsWith("/import");
    // A recipe, tag or ingredient changed since the search index was last fetched.
    let searchStale = false;
    const refresh = () => {
      if (searchStale) window.dispatchEvent(new Event(LIBRARY_CHANGED));
      searchStale = false;
      router.refresh();
    };
    // A form of this page still on its way: reading the page now could draw it as it was
    // before, after the form's own answer. The read waits for the form.
    const busy = () => document.querySelector('[aria-busy="true"]') !== null;
    const read = () => {
      if (busy()) {
        timer = setTimeout(read, BUSY_RETRY_MS);
        return;
      }
      timer = undefined;
      pace = null;
      refresh();
    };
    const schedule = () => {
      if (pace === null) return;
      clearTimeout(timer);
      const now = Date.now();
      timer = setTimeout(read, Math.max(0, refreshAt({ now, firstAt, pace, lastOwn }) - now));
    };
    // Without a connection the page cannot be read again: Next.js would load it as a new
    // page, and the service worker would answer with the copy kept for the shop.
    const changed = (at: Pace, table: string) => {
      if (SEARCHED_TABLES.has(table)) searchStale = true;
      if (quiet() || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (pace === null) firstAt = Date.now();
      pace = quicker(pace, at);
      schedule();
    };
    const seen = () => {
      if (document.visibilityState !== "visible" || quiet() || !navigator.onLine) return;
      if (busy()) return;
      refresh();
    };
    // Every button of the app is a form. A tap moves a waiting read behind itself.
    const acted = () => {
      lastOwn = Date.now();
      schedule();
    };
    const channel = supabase.channel("household");
    for (const table of DAILY_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () =>
        changed("daily", table),
      );
    }
    for (const table of LIBRARY_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () =>
        changed("library", table),
      );
    }
    // The channel joins again by itself after the connection broke off. What changed in
    // between was never sent, so the page is read once it is back.
    let joined = false;
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (joined) {
        searchStale = true;
        seen();
      }
      joined = true;
    });
    // Safari brings a page back from its cache of pages gone back to, as it was.
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) seen();
    };
    document.addEventListener("visibilitychange", seen);
    // Back online, the page may have missed what the others changed meanwhile.
    window.addEventListener("online", seen);
    window.addEventListener("pageshow", shown);
    document.addEventListener("submit", acted, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
      window.removeEventListener("online", seen);
      window.removeEventListener("pageshow", shown);
      document.removeEventListener("submit", acted, true);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
