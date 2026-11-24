"use client";

import { useSyncExternalStore } from "react";
import { SharePdf, sharesFiles, usePdfShare } from "./pdf-link";

/**
 * Prints a note. In a browser it opens the device's print dialog, the page having its own
 * layout for paper. In the app on the home screen iOS ignores that dialog (reports of
 * September and November 2026), so there the note's PDF goes to the share sheet, which
 * prints it, as with "Als PDF" (`PdfLink`; David, 24 November 2026).
 */
export function PrintButton({ href, name }: { href: string; name: string }) {
  const pdf = usePdfShare(href, name);
  // In the app the tap asks the server: offline the bar at the foot says so.
  const app = useSyncExternalStore(
    () => () => {},
    sharesFiles,
    () => false,
  );
  return (
    <button
      type="button"
      className="btn btn-small"
      aria-busy={pdf.busy}
      data-pending={pdf.busy || undefined}
      data-online-only={app || undefined}
      onPointerDown={pdf.fetchAhead}
      onClick={(event) => {
        if (!pdf.share(event)) window.print();
      }}
    >
      {pdf.ready ? <SharePdf /> : "Drucken"}
    </button>
  );
}
