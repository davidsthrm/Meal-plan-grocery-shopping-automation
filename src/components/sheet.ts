/** How long a view over the whole screen takes to go back down (`.going`, `sheet-down`). */
export const SHEET_LEAVES_MS = 200;

/**
 * Lets the view for the shop or for cooking go down the way it came up, then closes it, as
 * the Merkzettel goes back up on its string. It rose like a sheet; vanishing at once, it
 * left without saying where to. A second tap while it goes changes nothing.
 */
export function leaveSheet(view: HTMLDialogElement | null, done: () => void): void {
  if (!view?.open) {
    done();
    return;
  }
  if (view.classList.contains("going")) return;
  view.classList.add("going");
  window.setTimeout(() => {
    view.classList.remove("going");
    view.close();
    done();
  }, SHEET_LEAVES_MS);
}
