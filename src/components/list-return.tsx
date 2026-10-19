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
const shelvesOf = () => [...document.querySelectorAll<HTMLElement>("main .shelf")];

/**
 * On a list of recipes: remembers, as a recipe is opened, where the list stood, and puts it
 * back there when the history steps back to it. The browser keeps the place on the page
 * itself, but not how far a shelf was scrolled sideways.
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
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
