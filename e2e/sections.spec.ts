import { expect, test } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";
import { expectSearchRowWithAdd } from "./helpers";

// On a phone the four sections stand at the top, a row under the logo, the Merkzettel and
// the account, in one block that stays there while the page scrolls (decided on 24
// November 2026, over a block that slid away on the way down).
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
  await expect(sections).toHaveCount(4);
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

// Import is a task done now and then, not a place gone to every week: it is "+ Rezept" on
// Rezepte, and its pages belong to Rezepte (25 November 2026).
test("+ Rezept on both views of Rezepte leads to the import, which belongs to Rezepte", async ({
  page,
}) => {
  await signIn(page);
  const sections = page.getByRole("navigation", { name: "Hauptbereiche" });
  await expect(sections.getByRole("link")).toHaveText(["Woche", "Einkauf", "Rezepte", "Favoriten"]);

  for (const view of ["/rezepte", "/rezepte/regal"]) {
    await page.goto(view);
    await page.getByRole("link", { name: "Rezept hinzufügen", exact: true }).click();
    await expect(page).toHaveURL(/\/import$/);
    await expect(page.getByRole("heading", { name: "Rezept hinzufügen", level: 1 })).toBeVisible();
    // Rezepte is the current section there, with its colour at the top.
    await expect(sections.getByRole("link", { name: "Rezepte" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.querySelector(".app-shell")!).getPropertyValue(
            "--section-tint",
          ),
        ),
      )
      .toBe("rgb(255, 223, 199)");
  }
  // And back.
  await page.getByRole("link", { name: "← Rezepte" }).click();
  await expect(page).toHaveURL(/\/rezepte$/);

  // Deeper in, too.
  await page.goto("/import/vorschlaege");
  await expect(sections.getByRole("link", { name: "Rezepte" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("+ Rezept stands at the end of the search row, clear of the field's words @webkit", async ({
  page,
}) => {
  await resetLibrary();
  await signIn(page);
  await page.goto("/rezepte");
  await expectSearchRowWithAdd(page);
});
