import { expect, test, type Page } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";
import { closePen, meal, openPen, persons, plan } from "./helpers";

// While planning, a meal is one line with one pen, and the pen holds what the row of signs
// held; a meal moves to another place of its week or swaps with the meal there (decided on
// 25 November 2026).

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-05-17";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

/** Whether the page is as wide and tall as the `tablet` variant of the styles. */
function wide(page: Page): boolean {
  const size = page.viewportSize();
  return !!size && size.width >= 736 && size.height >= 480;
}

test("on a phone a planned meal is one line, and its pen's sheet holds the rest @webkit", async ({
  page,
}) => {
  test.skip(wide(page), "a phone's screen");
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Montag Mittag", "Pilzrisotto");
  const lunch = meal(page, "Montag Mittag");

  // The dish, how many it is for in a word, and the pen: no stepper, no row of signs.
  await expect(lunch.getByText("4 Pers.")).toBeVisible();
  await expect(lunch.getByRole("button", { name: "Mehr von Pilzrisotto" })).toHaveCount(0);
  const box = await lunch.boundingBox();
  expect(box!.height).toBeLessThan(64);

  const pen = await openPen(page, "Montag Mittag");
  // A sheet from the foot of the screen, as wide as it.
  const sheet = await pen.boundingBox();
  const screen = page.viewportSize()!;
  expect(Math.round(sheet!.y + sheet!.height)).toBeGreaterThanOrEqual(screen.height - 2);
  expect(sheet!.width).toBeGreaterThan(screen.width - 2);
  await expect(pen.getByRole("button", { name: "Mehr von Pilzrisotto" })).toBeVisible();
  for (const row of ["Anderes Gericht", "Etwas dazu"]) {
    await expect(pen.getByRole("link", { name: row })).toBeVisible();
  }
  for (const row of ["Mehr kochen für Reste", "Auf einen anderen Tag", "Entfernen"]) {
    await expect(pen.getByRole("button", { name: row })).toBeVisible();
  }

  // A step of the persons leaves it open; "Fertig" closes it.
  await pen.getByRole("button", { name: "Mehr von Pilzrisotto" }).click();
  await expect(lunch.getByText("5 Pers.")).toBeAttached();
  await expect(pen.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(pen).toBeVisible();
  await pen.getByRole("button", { name: "Fertig" }).click();
  await expect(pen).toHaveCount(0);
  await expect(lunch.getByText("5 Pers.")).toBeVisible();
});

test("on an iPad or a laptop the pen's panel hangs at the pen, and the persons stay on the line @webkit", async ({
  page,
}) => {
  test.skip(!wide(page), "a wide screen");
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Montag Mittag", "Pilzrisotto");
  const lunch = meal(page, "Montag Mittag");
  await expect(lunch.getByRole("button", { name: "Mehr von Pilzrisotto" })).toBeVisible();

  const button = lunch.getByRole("button", { name: "Montag Mittag bearbeiten" });
  // By keyboard: the pen is a button, the panel takes the focus, Escape gives it back.
  await button.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Montag Mittag", exact: true });
  await expect(panel).toBeVisible();
  const at = (await button.boundingBox())!;
  const hangs = (await panel.boundingBox())!;
  expect(hangs.width).toBeLessThan(400);
  // Below the pen or above it, its right edge at the pen's.
  const below = hangs.y >= at.y + at.height - 1;
  const above = hangs.y + hangs.height <= at.y + 1;
  expect(below || above).toBe(true);
  expect(Math.abs(hangs.x + hangs.width - (at.x + at.width))).toBeLessThan(16);
  // The persons are not in it twice.
  await expect(panel.getByRole("button", { name: "Mehr von Pilzrisotto" })).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(panel.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();

  // A tap beside it closes it too, and lands on nothing under it.
  await button.click();
  await expect(panel).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(panel).toHaveCount(0);
});

test("a meal moves to a free place of its week with its persons", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Montag Mittag", "Pilzrisotto");
  await (
    await persons(page, "Montag Mittag")
  )
    .getByRole("button", { name: "Mehr von Pilzrisotto" })
    .click();
  await expect(meal(page, "Montag Mittag")).toContainText("5 Personen");
  await expect(meal(page, "Montag Mittag").locator('[aria-busy="true"]')).toHaveCount(0);
  await closePen(page);

  const pen = await openPen(page, "Montag Mittag");
  await pen.getByRole("button", { name: "Auf einen anderen Tag" }).click();
  // Its own place is marked and is no place to go.
  await expect(pen.getByRole("radio", { name: "Mo Mittag: Pilzrisotto" })).toBeDisabled();
  await pen.getByText("Mi Abend: frei").click();
  await expect(pen).toContainText("Frei.");
  await pen.getByRole("button", { name: "Verschieben" }).click();

  const wednesday = meal(page, "Mittwoch Abend");
  await expect(wednesday).toContainText("Pilzrisotto");
  await expect(wednesday).toContainText("5 Personen");
  await expect(
    meal(page, "Montag Mittag").getByRole("link", { name: "Montag Mittag planen" }),
  ).toBeVisible();
});

test("two meals swap, each with its persons and its side", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  // Monday's lunch with a spelt baguette, cooked for five.
  await page.getByRole("link", { name: "Montag Mittag planen" }).click();
  await page.getByLabel("Eigener Eintrag").fill("pilzrisotto");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await page
    .getByRole("region", { name: "Dazu, ohne Rezept" })
    .getByRole("button", { name: "Dinkelbaguette dazu" })
    .click();
  await expect(page.getByRole("status").first()).toContainText("Pilzrisotto + 1 Dinkelbaguette");
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await (
    await persons(page, "Montag Mittag")
  )
    .getByRole("button", { name: "Mehr von Pilzrisotto" })
    .click();
  await expect(meal(page, "Montag Mittag")).toContainText("5 Personen");
  await expect(meal(page, "Montag Mittag").locator('[aria-busy="true"]')).toHaveCount(0);
  await closePen(page);
  await plan(page, "Dienstag Abend", "Tomatensalat");

  const pen = await openPen(page, "Montag Mittag");
  await pen.getByRole("button", { name: "Auf einen anderen Tag" }).click();
  await pen.getByText("Di Abend: Tomatensalat").click();
  await expect(pen).toContainText("Tauscht mit Tomatensalat.");
  await pen.getByRole("button", { name: "Tauschen" }).click();

  const tuesday = meal(page, "Dienstag Abend");
  await expect(tuesday).toContainText("Pilzrisotto");
  await expect(tuesday).toContainText("5 Personen");
  await expect(tuesday).toContainText("Dazu: 1 Dinkelbaguette");
  const monday = meal(page, "Montag Mittag");
  await expect(monday).toContainText("Tomatensalat");
  await expect(monday).toContainText("4 Personen");
  await expect(monday).not.toContainText("Dinkelbaguette");
});

test("leftovers do not move before the meal they are cooked with", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Dienstag Mittag", "Kartoffelsuppe");
  const cooked = await openPen(page, "Dienstag Mittag");
  await cooked.getByRole("button", { name: "Mehr kochen für Reste" }).click();
  await cooked.getByRole("button", { name: "Übernehmen" }).click();
  await expect(meal(page, "Dienstag Abend")).toContainText("Reste von Di Mittag");

  // The leftovers before the soup: refused, and said why.
  const leftovers = await openPen(page, "Dienstag Abend");
  await leftovers.getByRole("button", { name: "Auf einen anderen Tag" }).click();
  await leftovers.getByText("Mo Abend: frei").click();
  await expect(leftovers).toContainText(
    "Die Reste am Di Abend sind von Di Mittag und müssen danach kommen.",
  );
  await expect(leftovers.getByRole("button", { name: "Verschieben" })).toBeDisabled();
  // A day later is fine.
  await leftovers.getByText("Mi Mittag: frei").click();
  await expect(leftovers).toContainText("Frei.");
  await expect(leftovers.getByRole("button", { name: "Verschieben" })).toBeEnabled();
  await closePen(page);

  // The soup after its leftovers: refused too.
  const soup = await openPen(page, "Dienstag Mittag");
  await soup.getByRole("button", { name: "Auf einen anderen Tag" }).click();
  await soup.getByText("Mi Abend: frei").click();
  await expect(soup).toContainText(
    "Die Reste am Di Abend sind von Di Mittag und müssen danach kommen.",
  );
  await expect(soup.getByRole("button", { name: "Verschieben" })).toBeDisabled();
});
