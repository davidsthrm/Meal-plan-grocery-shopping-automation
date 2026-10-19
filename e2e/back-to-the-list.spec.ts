import { expect, test, type Page } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const RECIPE_PAGE = /\/rezepte\/[0-9a-f-]{36}/;

test("the way back from a recipe leads to the list as it was left", async ({ page }) => {
  await page.goto("/rezepte?kategorie=hauptgericht");
  const results = page.getByRole("region", { name: "Ergebnisse" });
  const card = results.locator("a[href^='/rezepte/']").nth(9);
  await card.scrollIntoViewIfNeeded();
  const before = await scrollY(page);
  expect(before).toBeGreaterThan(400);
  await card.click();
  await expect(page).toHaveURL(RECIPE_PAGE);

  // "← Entdecken" steps back: the filter is kept, and so is the place on the page.
  await page.getByRole("link", { name: "← Entdecken" }).click();
  await expect(page).toHaveURL(/\/rezepte\?kategorie=hauptgericht$/);
  await expect(page.getByRole("status")).toHaveText("14 Rezepte passen dazu");
  await expect.poll(() => scrollY(page)).toBeGreaterThan(before - 60);
  expect(Math.abs((await scrollY(page)) - before)).toBeLessThan(60);
});

test("a shelf is scrolled sideways as it was after going back", async ({ page }) => {
  // The made-up cookbook's shelves fit a wide screen whole: narrow enough to scroll them.
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/rezepte");
  // The made-up cookbook was just written: let the live refresh it causes pass first.
  await page.waitForTimeout(4000);
  const shelf = page.locator(".shelf").first();
  const sideways = () => shelf.evaluate((element) => Math.round(element.scrollLeft));
  await shelf.evaluate((element) => element.scrollBy({ left: 400 }));
  // The shelf snaps to a card; that is where it was left.
  await page.waitForTimeout(500);
  const left = await sideways();
  expect(left).toBeGreaterThan(200);
  // Tapped where it is: Playwright's own click would scroll the card into view first.
  await shelf
    .locator("a[href^='/rezepte/']")
    .nth(2)
    .evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(RECIPE_PAGE);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
  await expect.poll(sideways).toBe(left);
});

test("a recipe opened directly leads to the library afresh", async ({ page }) => {
  await page.goto("/rezepte?q=lasagne");
  const href = await page
    .getByRole("region", { name: "Ergebnisse" })
    .locator("a[href^='/rezepte/']")
    .first()
    .getAttribute("href");
  await page.goto(href!);
  await page.getByRole("link", { name: "← Entdecken" }).click();
  await expect(page).toHaveURL(/\/rezepte$/);
});
