"use client";

import { useEffect } from "react";

/** How long the bar waits at most for a page: after that something else went wrong. */
const GIVE_UP_MS = 10_000;

/** The page asked for, as the address shows it without its anchor. */
function addressOf(url: URL | Location): string {
  return url.pathname + url.search;
}

/** The page has come: its address is there and what it shows is not the loading shape. */
function arrived(target: string): boolean {
  if (addressOf(location) !== target) return false;
  const page = document.querySelector(".page");
  return !!page?.firstElementChild && !page.querySelector(".page-loading");
}

/**
 * A thin bar at the top that runs from the moment a link is tapped until its page is there.
 * The loading shape of a section only shows once the browser has fetched it ahead, which
 * Safari does for the links on the screen a moment after they appear: a recipe tapped right
 * after scrolling showed an empty page for half a second, and the household saw no loading
 * at all (October 2026). The bar needs nothing fetched. It works on the address alone:
 * every link of the app, a filter that changes only the search part included.
 */
export function NavigationProgress() {
  useEffect(() => {
    const root = document.documentElement;
    let target: string | null = null;
    let giveUp = 0;

    const done = () => {
      target = null;
      delete root.dataset.navigating;
      window.clearTimeout(giveUp);
    };
    const check = () => {
      if (target !== null && arrived(target)) done();
    };
    // Before the link's own handler: Next.js stops the browser's navigation in it.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      const to = addressOf(url);
      // An anchor on the same page (#kochen, #merkzettel) or the page itself: nothing to wait for.
      if (to === addressOf(location)) return;
      // A PDF opens in the browser: no page of the app comes.
      if (url.pathname.endsWith("/pdf")) return;
      target = to;
      root.dataset.navigating = "";
      window.clearTimeout(giveUp);
      giveUp = window.setTimeout(done, GIVE_UP_MS);
    };

    const watcher = new MutationObserver(check);
    const main = document.querySelector("main");
    if (main) watcher.observe(main, { childList: true, subtree: true });
    document.addEventListener("click", onClick, true);
    // A step back in the history (`BackToList`, the browser's back) lands where it lands.
    window.addEventListener("popstate", done);
    return () => {
      watcher.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", done);
      done();
    };
  }, []);

  return <div className="nav-progress" aria-hidden />;
}
