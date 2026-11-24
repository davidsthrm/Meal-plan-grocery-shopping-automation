"use client";

import { useRef, useState, type ComponentProps, type MouseEvent } from "react";
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
function sharesFiles(): boolean {
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
      if (!response.ok) throw new Error(`${href}: ${response.status}`);
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
 * A link to a PDF the server makes. In a browser it opens the PDF, whose viewer prints and
 * keeps it. The app on the home screen has no browser bar: a PDF opened there could be
 * neither printed nor saved (November 2026). There a tap hands the PDF to the share sheet
 * instead, which prints it, keeps it in Dateien or sends it.
 *
 * Safari shares only right after a tap, and the PDF can take longer to come: it is fetched
 * the moment the finger lands. Should it still come too late, the link says "PDF teilen",
 * and its next tap shares at once. Offline the bar at the foot says that it needs a
 * connection (`ConnectionGuard`, `data-online-only`).
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
  const fetched = useRef<Fetched | null>(null);
  const [busy, setBusy] = useState(false);
  // The link whose PDF came too late for its tap and waits for the next one.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === link.href;

  // A PDF that waits for its tap is kept; otherwise each tap fetches the plan as it is now.
  function fetchAhead() {
    if (!ready && !busy && sharesFiles()) fetched.current = fetchPdf(link.href, name);
  }

  async function share(event: MouseEvent<HTMLAnchorElement>) {
    if (!sharesFiles()) return;
    event.preventDefault();
    // A tap again while the PDF is on its way is the same tap.
    if (busy) return;
    if (fetched.current?.href !== link.href) fetched.current = fetchPdf(link.href, name);
    const pdf = fetched.current;
    setBusy(pdf.file === null);
    let late = false;
    try {
      // Shared at once where the PDF is here: while the tap still counts.
      await navigator.share({ files: [pdf.file ?? (await pdf.coming)], title: name });
    } catch (error) {
      late = error instanceof DOMException && error.name === "NotAllowedError";
      // The sheet closed without anything chosen is no error.
      if (!late && !(error instanceof DOMException && error.name === "AbortError")) throw error;
    } finally {
      setBusy(false);
      setReadyFor(late ? link.href : null);
      if (!late) fetched.current = null;
    }
  }

  return (
    <a
      {...link}
      aria-label={ready ? "PDF teilen" : link["aria-label"]}
      title={ready ? "PDF teilen" : link.title}
      aria-busy={busy}
      data-pending={busy || undefined}
      data-online-only
      onPointerDown={fetchAhead}
      onClick={share}
    >
      {ready ? (
        <>
          <ShareIcon />
          <span>PDF teilen</span>
        </>
      ) : (
        children
      )}
    </a>
  );
}
