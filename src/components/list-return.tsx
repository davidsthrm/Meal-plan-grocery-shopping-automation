"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  cameBack,
  canStepBack,
  LIST_RETURN_KEY,
  readLeftList,
  type LeftList,
} from "@/lib/list-return";

function read(): LeftList | null {
  try {
    return readLeftList(sessionStorage.getItem(LIST_RETURN_KEY));
  } catch {
    return null;
  }
}

const here = () => `${location.pathname}${location.search}`;
/** Every row that scrolls sideways: the shelves, the rows of three, the cookbooks, the tabs. */
const shelvesOf = () => [
  ...document.querySelectorAll<HTMLElement>(
    "main .shelf, main .shelf-list, main .bookshelf, main .tab-row",
  ),
];

/**
 * On a list of recipes or the week plan: remembers, as a recipe is opened, where the page
 * stood, and puts it back there when the history steps back to it. The browser keeps the
 * place on the page itself, but not how far a shelf was scrolled sideways. Opened afresh
 * with an anchor, the page goes to it.
 */
export function ListMemory() {
  useEffect(() => {
    const saved = read();
    if (saved && cameBack(saved, here(), history.length)) {
      requestAnimationFrame(() => {
        shelvesOf().forEach((shelf, at) => {
          shelf.scrollLeft = saved.shelves[at] ?? 0;
        });
        if (Math.abs(window.scrollY - saved.scrollY) > 40) window.scrollTo(0, saved.scrollY);
      });
    } else if (location.hash.length > 1) {
      // Opened afresh with an anchor ("#tag-2026-10-15"): the router looked for it while the
      // page's placeholder was shown, found nothing and stayed at the top.
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }

    const remember = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href^='/rezepte/']");
      if (!link) return;
      const left: LeftList = {
        path: here(),
        historyLength: history.length,
        scrollY: Math.round(window.scrollY),
        shelves: shelvesOf().map((shelf) => Math.round(shelf.scrollLeft)),
      };
      try {
        sessionStorage.setItem(LIST_RETURN_KEY, JSON.stringify(left));
      } catch {
        // Without storage the way back opens the list afresh, as a link does.
      }
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, []);
  return null;
}

/**
 * The link back from a recipe to its list. When the recipe was opened from that list, it
 * steps back in the history, to the filter and the place it was left at; otherwise, and
 * before any script has loaded, it opens the list.
 */
export function BackToList({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        if (!canStepBack(read(), href, history.length)) return;
        event.preventDefault();
        // A step back in the history carries no transition: the page comes in from the left
        // by this mark instead, as it does by a link back.
        const root = document.documentElement;
        root.dataset.going = "back";
        window.setTimeout(() => delete root.dataset.going, 800);
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
