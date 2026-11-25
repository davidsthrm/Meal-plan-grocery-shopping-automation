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

/**
 * On Entdecken: "+ Rezept" is the last thing in the search row, a finger tall, and the field
 * beside it still has room for its words ("Titel oder Zutat").
 */
export async function expectSearchRowWithAdd(page: Page) {
  const field = page.getByPlaceholder("Titel oder Zutat");
  const add = page.getByRole("link", { name: "Rezept hinzufügen", exact: true });
  // While the page streams in, the row stands in a hidden part of it and has no box yet.
  await expect(field).toBeVisible();
  await expect(add).toBeVisible();
  const fieldBox = (await field.boundingBox())!;
  const addBox = (await add.boundingBox())!;
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(middle(addBox) - middle(fieldBox))).toBeLessThan(2);
  expect(addBox.x).toBeGreaterThan(fieldBox.x + fieldBox.width);
  const filter = page.getByRole("button", { name: "Filter", exact: true });
  if (await filter.isVisible()) expect(addBox.x).toBeGreaterThan((await filter.boundingBox())!.x);
  expect(addBox.height).toBeGreaterThanOrEqual(44);
  // The words measured as drawn. WebKit's clear button would take about 15px more, which the
  // canvas does not see: the field keeps it out while it is empty (globals.css).
  const room = await field.evaluate((input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const inner =
      input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return inner - context.measureText(input.placeholder).width;
  });
  expect(room).toBeGreaterThanOrEqual(0);
}
