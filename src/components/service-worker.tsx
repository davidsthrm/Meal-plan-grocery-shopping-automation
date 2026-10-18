"use client";

import { useEffect } from "react";
import { clearTickStore } from "@/lib/tick-store";

/** Set when someone signs out, read on the login page that follows. */
const SIGNED_OUT = "essensplan-abgemeldet";

/**
 * Installs the service worker (`public/sw.js`), which makes the app installable and keeps
 * the shopping notes for the shop. In production a page kept for the shop is shown when
 * the network has not answered within a few seconds: in a shop the connection often
 * hangs rather than fails. The dev server takes longer than that to build a page.
 *
 * Signing out is remembered here, so that the login page can forget what this device kept.
 */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const wait = process.env.NODE_ENV === "production" ? 4000 : 0;
      navigator.serviceWorker
        .register(`/sw.js?wait=${wait}`, { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Without it the app works as a website: online only.
        });
    }
    const signingOut = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement && event.target.hasAttribute("data-sign-out")) {
        try {
          localStorage.setItem(SIGNED_OUT, "1");
        } catch {
          // Private mode: the login page then forgets nothing.
        }
      }
    };
    document.addEventListener("submit", signingOut, true);
    return () => document.removeEventListener("submit", signingOut, true);
  }, []);
  return null;
}

/** How long the page shown must stay unchanged before it is kept again. */
const SETTLE_MS = 3000;

function tell(message: { type: "keep"; pages: string[]; again?: boolean }) {
  if (!("serviceWorker" in navigator) || !navigator.onLine) return;
  void navigator.serviceWorker.ready.then((registration) =>
    registration.active?.postMessage(message),
  );
}

/**
 * Asks the service worker to keep these pages for the shop. It fetches each one that it has
 * not fetched in the last minutes, and the scripts and styles it needs. The page shown is
 * kept again whenever it changed (`readAt`) and then stayed as it is for a moment: a line
 * written on the note is on the copy for the shop too.
 */
export function KeepForTheShop({ pages, readAt }: { pages: readonly string[]; readAt: number }) {
  const list = pages.join("\n");
  useEffect(() => {
    tell({ type: "keep", pages: list.split("\n") });
  }, [list]);
  useEffect(() => {
    const timer = setTimeout(() => {
      tell({
        type: "keep",
        pages: [window.location.pathname + window.location.search],
        again: true,
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [readAt]);
  return null;
}

/**
 * On the login page after signing out: forgets the notes kept for the shop and the ticks
 * not sent yet. Whoever signs in next on this device starts without them.
 */
export function ForgetSignedOut() {
  useEffect(() => {
    let signedOut = false;
    try {
      signedOut = localStorage.getItem(SIGNED_OUT) === "1";
      localStorage.removeItem(SIGNED_OUT);
    } catch {
      return;
    }
    if (!signedOut) return;
    void clearTickStore();
    if ("caches" in window) {
      void caches
        .keys()
        .then((names) =>
          Promise.all(
            names.filter((name) => name.startsWith("pages-")).map((name) => caches.delete(name)),
          ),
        );
    }
  }, []);
  return null;
}
