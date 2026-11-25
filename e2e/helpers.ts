import { expect, type Locator, type Page } from "@playwright/test";

// Helpers on the page that several spec files share. What puts the database into a known
// state is in fixtures.ts.

/** A meal on the week plan, by its name ("Dienstag Abend"). */
export const meal = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** Plans a recipe for a meal by searching for it, and goes back to the week plan. */
export async function plan(page: Page, name: string, recipe: string) {
  await page.getByRole("link", { name: `${name} planen` }).click();
  await page.getByPlaceholder("Titel oder Zutat").fill(recipe);
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("button", { name: `${recipe} einplanen` })
    .click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, name)).toContainText(recipe);
}

/**
 * The pen of a planned meal, opened: everything that is done with the meal is a row of what
 * it opens, a sheet on a phone and a panel at the pen on a wider screen. Opened already, it
 * is that one.
 */
export async function openPen(page: Page, name: string): Promise<Locator> {
  const pen = page.getByRole("dialog", { name, exact: true });
  if (!(await pen.isVisible())) {
    await meal(page, name)
      .getByRole("button", { name: `${name} bearbeiten` })
      .click();
  }
  await expect(pen).toBeVisible();
  return pen;
}

/** Closes the pen's sheet or panel that is open, if one is. */
export async function closePen(page: Page) {
  const open = page.getByRole("dialog");
  if (await open.isVisible()) await page.keyboard.press("Escape");
  await expect(open).toHaveCount(0);
}

/**
 * Where a planned meal's persons are stepped: on its line from the tablet width on, in its
 * pen's sheet on a phone.
 */
export async function persons(page: Page, name: string): Promise<Locator> {
  const line = meal(page, name);
  const onLine = line.getByRole("button", { name: /^Mehr von / }).first();
  return (await onLine.isVisible()) ? line : openPen(page, name);
}

/** A shopping note among the others: the notes still to do, or those done at the foot. */
export const tile = (page: Page, note: string) =>
  page.getByRole("list", { name: /Zettel$/ }).getByRole("link", { name: new RegExp(`^${note}`) });

/** The shopping note picked up. */
export const sheet = (page: Page, note: string) =>
  page.getByRole("region", { name: note, exact: true });

/** Whether the service worker has kept the page shown, with `text` on it. */
export async function keptWith(page: Page, text: string): Promise<boolean> {
  const url = new URL(page.url());
  return page.evaluate(
    async ({ key, text }) => {
      const kept = await caches.match(key);
      return kept ? (await kept.text()).includes(text) : false;
    },
    { key: url.origin + url.pathname + url.search, text },
  );
}
