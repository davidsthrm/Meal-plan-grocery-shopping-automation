"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

/** What the household changes together: the plan, the lists, the note, the goals. */
const SHARED = [
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
 * Keeps the page in step with the other devices of the household: when someone plans a
 * meal, ticks a line or writes on the note, every open page reads itself again. Nothing is
 * taken from the message but the fact that something changed, so what a page shows always
 * comes from the server, under the same rules as on a reload.
 *
 * A phone that was asleep may have missed a message. A page that comes back into view reads
 * itself again as well.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // An import stores recipes by the hundred. Its own pages follow it by themselves.
    const quiet = () => window.location.pathname.startsWith("/import");
    const changed = () => {
      if (quiet() || document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), SETTLE_MS);
    };
    const channel = supabase.channel("household");
    for (const table of SHARED) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, changed);
    }
    // Of the recipes only what is changed on one: a favourite, a wish, a correction.
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "recipe" }, changed);
    channel.subscribe();

    const seen = () => {
      if (document.visibilityState === "visible" && !quiet()) router.refresh();
    };
    document.addEventListener("visibilitychange", seen);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
