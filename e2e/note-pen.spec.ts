import { expect, test, type Page } from "@playwright/test";
import { planAsExtra, resetHousehold, resetLibrary, signIn } from "./fixtures";
import { sheet } from "./helpers";

// A week far enough ahead that every errand of it is still to come.
const WEEK = "2027-03-01";
const MONDAY = "Supermarkt, Montag, 1. März";

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
  // Cakes for an invitation: two boxes of ten eggs on the week's first errand.
  await planAsExtra("Zitronen-Mohn-Kuchen", WEEK);
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
});

const eggs = (page: Page) =>
  sheet(page, MONDAY).locator("li.swipe-row").filter({ hasText: "Eier" });
const pen = (page: Page) => page.getByRole("dialog", { name: "Eier" });

test("on a note the pen changes how many and the note, and buys nothing @webkit", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // At home the pen says how many to buy, not what was bought.
  await eggs(page).getByRole("button", { name: "Eier: Menge oder Notiz ändern" }).click();
  await expect(pen(page).getByRole("group", { name: "Menge" })).toBeVisible();
  await expect(pen(page).getByLabel("Notiz", { exact: true })).toBeVisible();
  await expect(pen(page)).not.toContainText("Gekauft");
  await expect(pen(page)).not.toContainText("Anderes Produkt");

  // Six eggs are enough: seven typed, and one less.
  const amount = pen(page).getByLabel("Menge von Eier");
  await expect(amount).toHaveValue("20");
  await amount.fill("7");
  await pen(page).getByRole("button", { name: "Weniger" }).click();
  await expect(amount).toHaveValue("6");
  await pen(page).getByRole("button", { name: "Speichern" }).click();
  await expect(pen(page)).toBeHidden();
  // Changed, not bought: the line says what the plan has, and its box is still open.
  await expect(eggs(page)).toContainText("6x Eier (Plan: 20x)");
  await expect(eggs(page).getByRole("button", { name: "6x Eier: erledigt" })).toBeVisible();
  // Read again from the server, it says the same.
  await page.reload();
  await expect(eggs(page)).toContainText("6x Eier (Plan: 20x)");
  await expect(eggs(page).getByRole("button", { name: "6x Eier: erledigt" })).toBeVisible();

  // In the shop the pen still says what was bought, of the six.
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  await shop
    .getByRole("listitem")
    .filter({ hasText: "Eier" })
    .getByRole("button", { name: "Eier: Menge oder Produkt ändern" })
    .click();
  await expect(pen(page)).toContainText("von 6");
  await expect(pen(page).getByRole("button", { name: "Gekauft" })).toBeVisible();
  await pen(page).getByRole("button", { name: "Abbrechen" }).click();
  await shop.getByRole("button", { name: "Fertig" }).first().click();

  // "Wie geplant" takes the change back.
  await eggs(page).getByRole("button", { name: "Eier: Menge oder Notiz ändern" }).click();
  await expect(pen(page)).toContainText("Geplant: 20x");
  await pen(page).getByRole("button", { name: "Wie geplant" }).click();
  await expect(pen(page)).toBeHidden();
  await expect(eggs(page)).toContainText("20x Eier");
  await expect(eggs(page)).not.toContainText("Plan:");

  // A note written alone leaves the amount to the plan.
  await eggs(page).getByRole("button", { name: "Eier: Menge oder Notiz ändern" }).click();
  await pen(page).getByLabel("Notiz", { exact: true }).fill("Freiland");
  await pen(page).getByRole("button", { name: "Speichern" }).click();
  await expect(eggs(page)).toContainText("20x Eier Freiland");
  await expect(eggs(page)).not.toContainText("Plan:");
});

test("held, a line on a note offers the same as its pen @webkit", async ({ page }) => {
  await eggs(page).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Eier" });
  await expect(menu.getByRole("menuitem", { name: "Menge oder Notiz ändern …" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Nicht alles bekommen …" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Menge oder Notiz ändern …" }).click();
  await expect(pen(page).getByRole("group", { name: "Menge" })).toBeVisible();
  await expect(pen(page)).not.toContainText("Gekauft");
});
