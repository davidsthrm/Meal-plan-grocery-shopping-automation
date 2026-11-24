import { expect, test, type Locator } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";
import { meal, plan } from "./helpers";

// David on his iPhone (23 November 2026): the plan's buttons stood under each other, and a
// saved plan did not say for how many a meal is cooked.
test.use({ viewport: { width: 375, height: 667 } });

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's screen");
  await resetLibrary();
  await signIn(page);
});

/** The tops of the given buttons: one row has one top. */
async function tops(...buttons: Locator[]): Promise<number[]> {
  return Promise.all(buttons.map(async (button) => Math.round((await button.boundingBox())!.y)));
}

test("each set of the plan's buttons is one row, and a saved meal says its persons", async ({
  page,
}) => {
  await page.goto("/woche?w=2027-05-10");
  await plan(page, "Montag Mittag", "Pilzrisotto");

  // Planning: complete, print, rub out and save. Beside "Vervollständigen" the printer is
  // its sign alone.
  const planning = await tops(
    page.getByRole("button", { name: "Plan vervollständigen" }),
    page.getByRole("link", { name: "Drucken" }),
    page.getByRole("button", { name: "Ganze Woche leeren" }),
    page.getByRole("button", { name: "Plan speichern" }),
  );
  expect(new Set(planning).size).toBe(1);
  await expect(page.getByRole("link", { name: "Drucken" }).getByText("Drucken")).toBeHidden();

  // Saved: "Drucken" in words and "Plan bearbeiten".
  await page.getByRole("button", { name: "Plan speichern" }).click();
  const edit = page.getByRole("button", { name: "Plan bearbeiten" });
  await expect(edit).toBeVisible();
  const print = page.getByRole("link", { name: "Drucken" });
  await expect(print.getByText("Drucken")).toBeVisible();
  const saved = await tops(print, edit);
  expect(new Set(saved).size).toBe(1);

  // The meal says for how many it is cooked, beside the dish.
  await expect(meal(page, "Montag Mittag")).toContainText("4 Personen");
  await edit.click();
  await expect(page.getByRole("button", { name: "Plan speichern" })).toBeVisible();
});

// Audit, 24 November 2026: one tap on the stepper of a saved meal closed its pen, so the
// second tap after a pause landed on a meal to read.
test("a saved meal's pen stays open while its persons change, until Fertig", async ({ page }) => {
  await page.goto("/woche?w=2027-05-10");
  await plan(page, "Montag Mittag", "Pilzrisotto");
  await page.getByRole("button", { name: "Plan speichern" }).click();
  await expect(page.getByRole("button", { name: "Plan bearbeiten" })).toBeVisible();

  const monday = meal(page, "Montag Mittag");
  await monday.getByRole("link", { name: "Montag Mittag bearbeiten" }).click();
  const fewer = monday.getByRole("button", { name: "Weniger von Pilzrisotto" });
  for (const persons of ["3 Personen", "2 Personen"]) {
    await fewer.click();
    await expect(monday).toContainText(persons);
    await expect(monday.locator('[aria-busy="true"]')).toHaveCount(0);
    // The page has come back from the server, and the pen is still open.
    await page.waitForTimeout(500);
    await expect(fewer).toBeVisible();
  }
  // "Mehr kochen" opens its form in the pen too.
  await monday.getByRole("link", { name: "Montag Mittag: mehr kochen" }).click();
  await expect(monday.getByRole("button", { name: "Übernehmen" })).toBeVisible();
  await monday.getByRole("button", { name: "Übernehmen" }).click();
  await expect(monday).toContainText("4 Extra-Portionen");
  await expect(fewer).toBeVisible();

  // Only "Fertig" closes it.
  await monday.getByRole("link", { name: "Fertig" }).click();
  await expect(fewer).toHaveCount(0);
  await expect(monday.getByRole("link", { name: "Montag Mittag bearbeiten" })).toBeVisible();
});
