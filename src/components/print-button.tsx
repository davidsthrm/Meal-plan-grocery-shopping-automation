"use client";

/** Opens the print dialog of the device. The page has its own layout for paper. */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-small" onClick={() => window.print()}>
      Drucken
    </button>
  );
}
