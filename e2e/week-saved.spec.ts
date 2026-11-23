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

  // Planning: complete, pin, rub out and save.
  const planning = await tops(
    page.getByRole("button", { name: "Plan vervollständigen" }),
    page.getByRole("link", { name: "Für die Pinnwand" }),
    page.getByRole("button", { name: "Ganze Woche leeren" }),
    page.getByRole("button", { name: "Plan speichern" }),
  );
  expect(new Set(planning).size).toBe(1);

  // Saved: the pin and "Plan bearbeiten".
  await page.getByRole("button", { name: "Plan speichern" }).click();
  const edit = page.getByRole("button", { name: "Plan bearbeiten" });
  await expect(edit).toBeVisible();
  const saved = await tops(page.getByRole("link", { name: "Für die Pinnwand" }), edit);
  expect(new Set(saved).size).toBe(1);

  // The meal says for how many it is cooked, beside the dish.
  await expect(meal(page, "Montag Mittag")).toContainText("4 Personen");
  await edit.click();
  await expect(page.getByRole("button", { name: "Plan speichern" })).toBeVisible();
});
