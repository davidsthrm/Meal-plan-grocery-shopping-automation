import { expect, test } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

// On a phone the five sections stand at the top, a row under the logo, the Merkzettel and
// the account, in one block that stays there while the page scrolls (David, 24 November
// 2026). He did not want it to slide away on the way down.
test("every section is one tap away far down a long page on a phone @webkit", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile || page.viewportSize()!.width >= 640, "a phone's screen");
  // A long page: every recipe of the test cookbooks in "Alle Rezepte".
  await resetLibrary();
  await signIn(page);
  await page.goto("/import/rezepte");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const { y, height } = await page.evaluate(() => ({ y: scrollY, height: innerHeight }));
  expect(y).toBeGreaterThan(height * 2);

  // The header stands at the top of the screen, the sections in it.
  const header = (await page.locator(".app-header").boundingBox())!;
  expect(header.y).toBeLessThanOrEqual(0);
  const sections = page.getByRole("navigation", { name: "Hauptbereiche" }).getByRole("link");
  await expect(sections).toHaveCount(5);
  for (const link of await sections.all()) {
    const box = (await link.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(header.y + header.height);
    expect(box.height).toBeGreaterThanOrEqual(44);
    // Where a finger lands on it, nothing of the page lies over it.
    const middle = [box.x + box.width / 2, box.y + box.height / 2];
    expect(
      await link.evaluate(
        (element, [x, y]) => element.contains(document.elementFromPoint(x, y)),
        middle,
      ),
    ).toBe(true);
  }

  // A tap where the word stands, without scrolling back up.
  const einkauf = (await sections.filter({ hasText: "Einkauf" }).boundingBox())!;
  await page.mouse.click(einkauf.x + einkauf.width / 2, einkauf.y + einkauf.height / 2);
  await expect(page).toHaveURL(/\/einkauf/);
});
