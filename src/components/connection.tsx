"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Whether the device has a connection, as far as the browser knows. On the server, and
 * until the page has started, it counts as online.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Says so while the device is offline, on every page. Every button of the app is a form
 * sent to the server; without a connection it would fail with an error page. So a form is
 * not sent then, and the bar says why. Only ticks on a shopping note (`data-offline-ok`)
 * work without a connection: they are kept and sent later.
 */
export function ConnectionGuard() {
  const online = useOnline();
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const stop = (event: SubmitEvent) => {
      if (navigator.onLine) return;
      const form = event.target;
      if (form instanceof HTMLFormElement && form.hasAttribute("data-offline-ok")) return;
      event.preventDefault();
      event.stopPropagation();
      setRefused(true);
    };
    const back = () => setRefused(false);
    document.addEventListener("submit", stop, true);
    window.addEventListener("online", back);
    return () => {
      document.removeEventListener("submit", stop, true);
      window.removeEventListener("online", back);
    };
  }, []);

  if (online) return null;
  return (
    <p role="status" className="offline-bar print:hidden" data-refused={refused}>
      {refused
        ? "Offline: Das geht erst wieder mit Verbindung."
        : "Offline: Die Einkaufszettel gehen weiter, alles andere braucht eine Verbindung."}
    </p>
  );
}

/**
 * The note at the top of a page that does nothing without the server: the import, the
 * settings. Shown while the device is offline.
 */
export function NeedsConnection({ children }: { children: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="card mx-auto mb-6 max-w-5xl border-warn bg-warn-soft px-4 py-3 text-warn">
      <p className="font-semibold">Keine Verbindung</p>
      <p className="mt-1">{children} Sobald wieder Netz da ist, geht es hier weiter.</p>
    </div>
  );
}
