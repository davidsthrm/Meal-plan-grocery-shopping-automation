"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloseIcon, ShareIcon } from "@/components/icons";
import { INSTALL_HINT_KEY, installHint, type InstallHint } from "@/lib/install-hint";

/** Chrome's install prompt, which it hands over before it would show its own. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

const nothingToFollow = () => () => {};

/** The browser in one word: opened from the home screen, put away, Safari, or another. */
function browserSituation(): "installed" | "dismissed" | "safari" | "other" {
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (installed) return "installed";
  if (wasDismissed()) return "dismissed";
  return "standalone" in navigator ? "safari" : "other";
}

function dismiss() {
  try {
    localStorage.setItem(INSTALL_HINT_KEY, "1");
  } catch {
    // Without storage the hint comes back on the next visit; it can be put away again.
  }
}

/**
 * A short hint above the page, in the browser only: how to put the app on the home screen,
 * that it then opens without the browser's bars, and that it asks for the login once more.
 * It goes once it is used or put away.
 */
export function InstallHintCard() {
  // What the browser says of itself does not change while the page is open; on the server
  // and before hydration there is no hint.
  const seen = useSyncExternalStore(nothingToFollow, browserSituation, () => "installed");
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const offered = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      dismiss();
      setClosed(true);
    };
    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", offered);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  const hint: InstallHint = closed
    ? null
    : installHint({
        installed: seen === "installed",
        safari: seen === "safari",
        canPrompt: prompt !== null,
        dismissed: seen === "dismissed",
      });
  if (!hint) return null;
  const close = () => {
    dismiss();
    setClosed(true);
  };
  return (
    <aside
      aria-label="Als App auf dem Home-Bildschirm"
      className="install-hint mx-auto mb-4 flex max-w-5xl items-start gap-3 rounded-xl bg-accent-soft px-4 py-3 print:hidden"
    >
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <p className="font-semibold text-ink">Essensplan als App auf dem Home-Bildschirm</p>
        {hint === "safari" ? (
          <p className="mt-1">
            Tippe in Safari auf Teilen{" "}
            <span className="inline-flex translate-y-0.5 text-accent">
              <ShareIcon />
            </span>{" "}
            (steht es nicht unten, erst auf •••) und dann auf „Zum Home-Bildschirm“. In der App
            meldest du dich einmal neu an.
          </p>
        ) : (
          <>
            <p className="mt-1">
              Sie öffnet sich dann ohne Browserleiste. In der App meldest du dich einmal neu an.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-small mt-2"
              onClick={async () => {
                if (!prompt) return;
                await prompt.prompt();
                const { outcome } = await prompt.userChoice;
                if (outcome === "accepted") close();
                setPrompt(null);
              }}
            >
              App installieren
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        className="icon-button -mt-2 -mr-2 shrink-0"
        aria-label="Hinweis schließen"
        title="Schließen"
        onClick={close}
      >
        <CloseIcon />
      </button>
    </aside>
  );
}
