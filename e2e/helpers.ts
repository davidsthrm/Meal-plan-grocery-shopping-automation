import { expect, type Page } from "@playwright/test";

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
