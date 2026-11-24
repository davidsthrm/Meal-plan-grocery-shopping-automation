"use client";

import { useEffect, useRef, useState, type ComponentProps, type MouseEvent } from "react";
import { ShareIcon } from "./icons";
import { isInstalled } from "./install-hint";

/** A PDF on its way from the server, for the link that asked for it. */
interface Fetched {
  href: string;
  /** The PDF once it is here. */
  file: File | null;
  coming: Promise<File>;
}

/** Whether a tap hands the PDF to the share sheet: in the installed app, where it can. */
export function sharesFiles(): boolean {
  return (
    isInstalled() &&
    "canShare" in navigator &&
    navigator.canShare({ files: [new File([], "Essensplan.pdf", { type: "application/pdf" })] })
  );
}

function fetchPdf(href: string, name: string): Fetched {
  const fetched: Fetched = {
    href,
    file: null,
    coming: fetch(href).then(async (response) => {
      // Signed out, the server answers with the login page, which is no PDF to share.
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
        throw new Error(`${href}: ${response.status}`);
      }
      return new File([await response.blob()], `${name}.pdf`, { type: "application/pdf" });
    }),
  };
  // A failure is the tap's to handle; fetched ahead for a tap that never came, it is none.
  fetched.coming.then(
    (file) => {
      fetched.file = file;
    },
    () => {},
  );
  return fetched;
}

/**
 * What a tap on a link or button to a PDF does in the installed app (see `PdfLink`):
 * `fetchAhead` as the finger lands, and `share`, which takes the tap where the PDF goes to
 * the share sheet and says whether it did.
 */
export function usePdfShare(href: string, name: string) {
  const fetched = useRef<Fetched | null>(null);
  const [busy, setBusy] = useState(false);
  // The PDF that came too late for its tap and waits for the next one.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === href;

  // A form sent may change the plan or the note: the PDF kept for the next tap goes.
  useEffect(() => {
    if (!ready) return;
    const drop = () => {
      fetched.current = null;
      setReadyFor(null);
    };
    document.addEventListener("submit", drop);
    return () => document.removeEventListener("submit", drop);
  }, [ready]);

  // A PDF that waits for its tap is kept; otherwise each tap fetches the plan as it is now.
  function fetchAhead() {
    if (!ready && !busy && sharesFiles()) fetched.current = fetchPdf(href, name);
  }

  function share(event: MouseEvent<HTMLElement>): boolean {
    if (!sharesFiles()) return false;
    event.preventDefault();
    // A tap again while the PDF is on its way is the same tap.
    if (!busy) void send();
    return true;
  }

  async function send() {
    if (fetched.current?.href !== href) fetched.current = fetchPdf(href, name);
    const pdf = fetched.current;
    setBusy(pdf.file === null);
    let late = false;
    try {
      // Shared at once where the PDF is here: while the tap still counts.
      await navigator.share({ files: [pdf.file ?? (await pdf.coming)], title: name });
    } catch (error) {
      late = error instanceof DOMException && error.name === "NotAllowedError";
      // The sheet closed without anything chosen is no error. Where no PDF came (weak signal,
      // the login run out, the server failed), the PDF opens as in a browser, to show why.
      if (!late && !(error instanceof DOMException && error.name === "AbortError")) {
        window.location.assign(href);
      }
    } finally {
      setBusy(false);
      setReadyFor(late ? href : null);
      if (!late) fetched.current = null;
    }
  }

  return { busy, ready, fetchAhead, share };
}

/** What a link or button says while its PDF waits for the next tap. */
export function SharePdf() {
  return (
    <>
      <ShareIcon />
      <span>PDF teilen</span>
    </>
  );
}

/**
 * A link to a PDF the server makes. In a browser it opens the PDF, whose viewer prints and
 * keeps it. The app on the home screen has no browser bar: a PDF opened there could be
 * neither printed nor saved (November 2026). There a tap hands the PDF to the share sheet
 * instead, which prints it, keeps it in Dateien or sends it.
 *
 * Safari shares only right after a tap, and the PDF can take longer to come: it is fetched
 * the moment the finger lands. Should it still come too late, the link says "PDF teilen",
 * and its next tap shares at once. Where no PDF comes, the link opens as in a browser, to
 * show why. Offline the bar at the foot says that it needs a connection (`ConnectionGuard`,
 * `data-online-only`).
 */
export function PdfLink({
  name,
  children,
  ...link
}: ComponentProps<"a"> & {
  href: string;
  /** The PDF's title in the share sheet, and its file name. */
  name: string;
}) {
  const pdf = usePdfShare(link.href, name);
  return (
    <a
      {...link}
      aria-label={pdf.ready ? "PDF teilen" : link["aria-label"]}
      title={pdf.ready ? "PDF teilen" : link.title}
      aria-busy={pdf.busy}
      data-pending={pdf.busy || undefined}
      data-online-only
      onPointerDown={pdf.fetchAhead}
      onClick={pdf.share}
    >
      {pdf.ready ? <SharePdf /> : children}
    </a>
  );
}
