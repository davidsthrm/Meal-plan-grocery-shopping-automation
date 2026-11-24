import { expect, test, type Page } from "@playwright/test";
import { planAsExtra, resetHousehold, resetLibrary, signIn } from "./fixtures";
import { sheet, tile } from "./helpers";

// A week far enough ahead that every errand of it is still to come.
const WEEK = "2027-03-01";
const MONDAY = "Supermarkt, Montag, 1. März";
const TUESDAY = "Supermarkt, Dienstag, 2. März";

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
});

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
  // A line still to buy has its bin. Once the server has a removal, the line is listed again
  // under "Nicht gekaufte Einträge": counting every row with its name raced the server.
  const bin = (name: string) => shop.getByRole("button", { name: `${name} entfernen` });

  // The ginger shots are not needed after all: the bin, and nothing asks.
  await bin("Ingwer-Shots").click();
  await expect(bin("Ingwer-Shots")).toHaveCount(0);
  // Taken back from the bar at the foot, and removed again.
  await page.getByRole("status").getByRole("button", { name: "Widerrufen" }).click();
  await expect(bin("Ingwer-Shots")).toHaveCount(1);
  await bin("Ingwer-Shots").click();
  await expect(bin("Ingwer-Shots")).toHaveCount(0);

  // Three bottles of six, and the rest not bought.
  await row("Ensinger Sport")
    .getByRole("button", { name: "Ensinger Sport: Menge oder Produkt ändern" })
    .click();
  const edit = page.getByRole("dialog", { name: "Ensinger Sport" });
  for (let time = 0; time < 3; time++) await edit.getByRole("button", { name: "Weniger" }).click();
  await expect(edit).toContainText("Es fehlen noch 3 Stück Ensinger Sport.");
  await edit.getByRole("button", { name: "Rest verwerfen" }).click();
  // Bought in part, it goes under "Gekauft"; the rest is among what was not bought.
  await expect(
    shop
      .getByRole("region", { name: "Gekauft", exact: true })
      .getByRole("listitem")
      .filter({ hasText: "3 von 6 Stück · Rest nicht gekauft" }),
  ).toHaveCount(1);

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

test("the rest of a typed line moved to Tuesday keeps its unit", async ({ page }) => {
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await write(page, "500 g Lakritzschnecken");
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  await shop.getByRole("button", { name: "Lakritzschnecken: Menge oder Produkt ändern" }).click();
  const edit = page.getByRole("dialog", { name: "Lakritzschnecken" });
  await edit.getByLabel("Menge von Lakritzschnecken").fill("200");
  await expect(edit).toContainText("Es fehlen noch 300 g Lakritzschnecken.");
  await edit.getByRole("button", { name: "Rest verschieben" }).click();
  const move = page.getByRole("dialog", { name: "Rest: 300 g Lakritzschnecken" });
  await move.getByRole("button", { name: "Di 2.", exact: true }).click();
  await move.getByRole("button", { name: "Rest auf Di 2." }).click();
  await expect(
    shop.getByRole("region", { name: "Gekauft", exact: true }).getByRole("listitem"),
  ).toContainText("Rest → Di 2.");

  // On Tuesday's note the rest is weighed: it read "300x Lakritzschnecken" (November 2026).
  await expect(async () => {
    await page.goto(`/einkauf?w=${WEEK}&zettel=2027-03-02.supermarket`);
    await expect(sheet(page, TUESDAY)).toContainText("300 g Lakritzschnecken", { timeout: 2000 });
  }).toPass();
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
  // Bought, it goes under "Gekauft" a moment later. The next swipe waits for that, or the
  // rows would move under the finger.
  await expect(
    shop
      .getByRole("region", { name: "Gekauft", exact: true })
      .getByRole("button", { name: "Geschenkpapier", pressed: true }),
  ).toHaveCount(1);
  await swipe("Kerzen", -260);
  // Removed, it is no longer to buy, and once the server has it, it is among what was not
  // bought. Counting every row named "Kerzen" failed whenever the server was quicker than
  // the check (November 2026).
  await expect(shop.getByRole("button", { name: "Kerzen entfernen" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Kerzen entfernt");
  await expect(shop.getByRole("region", { name: "Nicht gekaufte Einträge" })).toContainText(
    "Kerzen",
  );

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

test("the shop's pen takes a part of a kilo as it is typed", async ({ page }) => {
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await write(page, "2 kg Lakritzschnecken");
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  await shop.getByRole("button", { name: "Lakritzschnecken: Menge oder Produkt ändern" }).click();
  const edit = page.getByRole("dialog", { name: "Lakritzschnecken" });
  const amount = edit.getByLabel("Menge von Lakritzschnecken");
  // Read at every key, "1," was 1 and "1,5" became 15 (audit, 24 November 2026).
  await amount.fill("");
  await amount.pressSequentially("1,5");
  await expect(amount).toHaveValue("1,5");
  await expect(edit).toContainText("Es fehlen noch 500 g Lakritzschnecken.");
  await edit.getByRole("button", { name: "Rest verschieben" }).click();
  await expect(page.getByRole("dialog", { name: "Rest: 500 g Lakritzschnecken" })).toBeVisible();
});

test("a tap beside a row's menu only closes it, and buys nothing", async ({ page }) => {
  await planAsExtra("Zitronen-Mohn-Kuchen", WEEK);
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  const progress = shop.locator(".store-head p");
  const before = await progress.textContent();

  await shop.getByRole("listitem").filter({ hasText: "Eier" }).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Eier" });
  await expect(menu).toBeVisible();
  // Another line, where the menu does not lie over it.
  const spread = (await menu.boundingBox())!;
  let target: { x: number; y: number; name: string | null } | null = null;
  for (const row of await shop.locator("button.store-row").all()) {
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    if (y > spread.y - 10 && y < spread.y + spread.height + 10) continue;
    if ((await row.textContent())?.includes("Eier")) continue;
    target = { x: box.x + box.width / 2, y, name: await row.textContent() };
    break;
  }
  expect(target).not.toBeNull();
  await page.mouse.click(target!.x, target!.y);
  // The tap closed the menu, and nothing more: it ticked the line under it, unseen.
  await expect(menu).toBeHidden();
  await page.waitForTimeout(600);
  await expect(shop.locator('button.store-row[aria-pressed="true"]')).toHaveCount(0);
  await expect(progress).toHaveText(before!);
});

test("a swipe or the menu that buys a line says so, to take it back", async ({ page }) => {
  await planAsExtra("Zitronen-Mohn-Kuchen", WEEK);
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await write(page, "Geschenkpapier");
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  const row = (text: string) => shop.getByRole("listitem").filter({ hasText: text });
  const box = (await row("Geschenkpapier").boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(box.x + box.width / 2 + (260 * step) / 8, y);
  }
  await page.mouse.up();
  const bar = page.getByRole("status").filter({ hasText: "Geschenkpapier gekauft" });
  await bar.getByRole("button", { name: "Widerrufen" }).click();
  await expect(
    shop.getByRole("button", { name: "Geschenkpapier", exact: true, pressed: false }),
  ).toBeVisible();

  // Held, the menu's "Gekauft" says it too.
  await row("Eier").click({ button: "right" });
  await page.getByRole("menu", { name: "Eier" }).getByRole("menuitem", { name: "Gekauft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Eier gekauft" })).toBeVisible();
});
