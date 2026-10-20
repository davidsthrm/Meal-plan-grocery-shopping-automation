import { expect, test, type Page } from "@playwright/test";
import { planAsExtra, resetHousehold, resetLibrary, signIn } from "./fixtures";

// A week far enough ahead that every errand of it is still to come.
const WEEK = "2027-03-01";
const MONDAY = "Supermarkt, Montag, 1. März";
const TUESDAY = "Supermarkt, Dienstag, 2. März";

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
});

const tile = (page: Page, note: string) =>
  // The notes still to do, or those done at the foot.
  page.getByRole("list", { name: /Zettel$/ }).getByRole("link", { name: new RegExp(`^${note}`) });
const sheet = (page: Page, note: string) => page.getByRole("region", { name: note, exact: true });

/** Writes lines onto Monday's note, as the household does before it goes. */
async function write(page: Page, ...lines: string[]) {
  const field = page.getByLabel("Auf den Zettel schreiben");
  for (const line of lines) {
    await field.fill(line);
    await field.press("Enter");
    // A number in front is how many: "4 Ingwer-Shots" reads "4x Ingwer-Shots".
    await expect(sheet(page, MONDAY)).toContainText(line.replace(/^\d+ /, ""));
  }
}

test("the Monday errand closes with what was not bought, and the eggs go to Tuesday", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Two cakes for an invitation: eggs, butter, lemons, bought on the week's first errand.
  await planAsExtra("Zitronen-Mohn-Kuchen", WEEK);
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await write(page, "4 Ingwer-Shots", "6 Ensinger Sport");

  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  const row = (text: string | RegExp) => shop.getByRole("listitem").filter({ hasText: text });

  // The ginger shots are not needed after all: the bin, and nothing asks.
  await row("Ingwer-Shots").getByRole("button", { name: "Ingwer-Shots entfernen" }).click();
  await expect(row("Ingwer-Shots")).toHaveCount(0);
  // Taken back from the bar at the foot, and removed again.
  await page.getByRole("status").getByRole("button", { name: "Widerrufen" }).click();
  await expect(row("Ingwer-Shots")).toHaveCount(1);
  await row("Ingwer-Shots").getByRole("button", { name: "Ingwer-Shots entfernen" }).click();
  await expect(row("Ingwer-Shots")).toHaveCount(0);

  // Three bottles of six, and the rest not bought.
  await row("Ensinger Sport")
    .getByRole("button", { name: "Ensinger Sport: Menge oder Produkt ändern" })
    .click();
  const edit = page.getByRole("dialog", { name: "Ensinger Sport" });
  for (let time = 0; time < 3; time++) await edit.getByRole("button", { name: "Weniger" }).click();
  await expect(edit).toContainText("Es fehlen noch 3 Stück Ensinger Sport.");
  await edit.getByRole("button", { name: "Rest verwerfen" }).click();
  await expect(row("Ensinger Sport")).toContainText("3 von 6 Stück · Rest nicht gekauft");

  // The eggs are sold out: bought on Tuesday instead, the shop stays.
  await row("Eier").getByRole("button", { name: "Eier verschieben" }).click();
  const move = page.getByRole("dialog", { name: "Eier verschieben" });
  await move.getByRole("button", { name: "Di 2." }).click();
  await move.getByRole("button", { name: "Eier auf Di 2." }).click();
  await expect(row(/^Eier/)).toContainText("→ Di 2.");

  // Everything else is in the trolley.
  await shop.getByRole("button", { name: "Einkauf erledigt" }).click();
  await shop.getByRole("button", { name: "Fertig" }).first().click();

  // Read again from the server: done, with what was not bought, and where the eggs went.
  await page.reload();
  const monday = sheet(page, MONDAY);
  await expect(monday.getByRole("status")).toContainText("Erledigt");
  await expect(monday.getByRole("status")).toContainText("2 Einträge nicht gekauft");
  const notBought = monday.getByRole("region", { name: "Nicht gekaufte Einträge" });
  await expect(notBought).toContainText("Ingwer-Shots");
  await expect(notBought).toContainText("Ensinger Sport · 3 Stück");
  await expect(notBought).not.toContainText("Eier");
  await expect(monday.getByRole("region", { name: "Verschoben" })).toContainText("Eier→ Di 2.");

  await page.getByRole("link", { name: "← Alle Zettel" }).click();
  await expect(tile(page, MONDAY)).toContainText("Erledigt");
  await expect(tile(page, MONDAY)).toContainText("2 Einträge nicht gekauft");
  await expect(tile(page, TUESDAY)).toContainText("Eier");

  // Put back on the note, the shots open the errand again.
  await tile(page, MONDAY).click();
  await notBought.getByRole("button", { name: "Wieder aufnehmen" }).first().click();
  await page.reload();
  await expect(sheet(page, MONDAY).getByRole("status")).toHaveCount(0);
});

test("a swipe buys a line or removes it, and holding it opens its menu", async ({ page }) => {
  await planAsExtra("Zitronen-Mohn-Kuchen", WEEK);
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await write(page, "Geschenkpapier", "Kerzen");
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  const row = (text: string) => shop.getByRole("listitem").filter({ hasText: text });

  const swipe = async (text: string, by: number) => {
    const box = (await row(text).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(box.x + box.width / 2 + (by * step) / 8, y);
    }
    await page.mouse.up();
  };

  await swipe("Geschenkpapier", 260);
  await expect(row("Geschenkpapier").getByRole("button", { pressed: true })).toHaveCount(1);
  await swipe("Kerzen", -260);
  await expect(row("Kerzen")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Kerzen entfernt");

  // A finger held still on a row: its actions, named.
  const eggs = (await row("Eier").boundingBox())!;
  await page.mouse.move(eggs.x + 40, eggs.y + eggs.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const menu = page.getByRole("menu", { name: "Eier" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Nicht alles bekommen …" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Am Di 2. kaufen" }).click();
  await expect(row("Eier")).toContainText("→ Di 2.");
});
