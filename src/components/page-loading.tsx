import { SheetHoles } from "./sheet-holes";

/**
 * What a section shows the moment its tab is tapped, while the server reads the page: its
 * name and the pale shape of what comes, a sheet of the pad or a few cards. Without it a
 * tap waited half a second for the whole page and seemed not to have landed. It appears
 * only after a moment, so that a page that comes quickly does not flash.
 */
export function PageLoading({ label, shape }: { label: string; shape: "sheet" | "cards" }) {
  return (
    <div className="page-loading mx-auto max-w-5xl" aria-busy="true">
      {/* No status role: a page's own status, such as the count of the Regal, comes first. */}
      <p className="sr-only">{label} wird geladen</p>
      <p className="eyebrow" aria-hidden>
        {label}
      </p>
      <span aria-hidden className="loading-bar mt-2 block h-8 w-56" />
      {shape === "sheet" ? (
        <div aria-hidden className="sheet mt-7 h-[22rem]">
          <SheetHoles />
        </div>
      ) : (
        <div aria-hidden className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((each) => (
            <span key={each} className="card block h-28" />
          ))}
        </div>
      )}
    </div>
  );
}
