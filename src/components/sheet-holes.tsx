/** Enough holes for the widest sheet (64rem); the strip cuts off what does not fit. */
const HOLES = 40;

/**
 * The holes of the binding along the top of a sheet (`.sheet`), as its first child.
 *
 * Each hole is an element of its own, not a repeated background: a browser rounds a repeated
 * background to whole pixels by itself, apart from the sheet's edge, so while a note tile was
 * lifted the holes lagged behind the sheet and jumped back when it came to rest.
 */
export function SheetHoles() {
  return (
    <span aria-hidden className="sheet-holes">
      {Array.from({ length: HOLES }, (_, hole) => (
        <span key={hole} />
      ))}
    </span>
  );
}
