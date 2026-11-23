import { expect, test, type Page } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

// The narrowest phone of the household's: 375 by 667 pixels, an iPhone SE. On it the week's
// arrows broke onto two rows, and the Rezept-Stapel's buttons lay under the bar of the
// sections (November 2026).
test.use({ viewport: { width: 375, height: 667 } });

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's screen");
  await resetLibrary();
  await signIn(page);
});

/** Where the strip of the sections at the foot of the screen begins, from the top. */
async function stripTop(page: Page): Promise<number> {
  const strip = await page.locator("nav.tabbar").boundingBox();
  expect(strip).not.toBeNull();
  return strip!.y;
}

test("the week's row of arrows is one line on every week, and the page ends above the strip", async ({
  page,
}) => {
  // The week the plan opens on, and a week that shows "Aktuelle" between the arrows.
  for (const week of ["", "?w=2027-03-01"]) {
    await page.goto(`/woche${week}`);
    const row = page.getByRole("navigation", { name: "Woche wechseln" });
    await expect(row.getByRole("link", { name: "Alle Wochen" })).toBeVisible();
    const box = await row.boundingBox();
    // One control is 44px tall: two rows would be twice that.
    expect(box!.height).toBeLessThan(60);
  }

  // At the end of the page nothing lies under the strip.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const main = await page.locator("main").boundingBox();
  expect(main!.y + main!.height).toBeLessThanOrEqual(await stripTop(page));
});

test("the Rezept-Stapel's three buttons stand above the strip as the page opens", async ({
  page,
}) => {
  await page.goto("/rezepte/stapel");
  const buttons = page.getByRole("group", { name: "Entscheiden" }).getByRole("button");
  await expect(buttons).toHaveCount(3);
  const top = await stripTop(page);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(top);
  }
});
