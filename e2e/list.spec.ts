import { expect, test, type Page } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-03-01";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

/** Plans a recipe for a meal by searching for it. */
async function plan(page: Page, meal: string, recipe: string) {
  await page.getByRole("link", { name: `${meal} planen` }).click();
  await page.getByPlaceholder("Titel oder Zutat").fill(recipe);
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("button", { name: `${recipe} einplanen` })
    .click();
  await expect(page.getByRole("region", { name: meal, exact: true })).toContainText(recipe);
}

/** The list of one shopping day, and one kind of grocery on it. */
const sheet = (page: Page, day: string) => page.getByRole("region", { name: day, exact: true });
const group = (page: Page, day: string, name: string) =>
  sheet(page, day).getByRole("region", { name, exact: true });

const MARKET = "Samstag, 27. Februar";
const MONDAY = "Montag, 1. März";

test("the week becomes a list for every shopping day, to work through", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Montag Mittag", "Pfeffersteak");
  await plan(page, "Dienstag Mittag", "Kartoffelsuppe");
  // A cold supper with bread from the bakery and a cucumber.
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await page.getByRole("button", { name: "Vesper" }).click();
  await page.getByRole("link", { name: "Montag Abend: Lebensmittel" }).click();
  await page.getByRole("button", { name: "Brot hinzufügen" }).click();
  await page.getByRole("button", { name: "Gurke hinzufügen" }).click();
  await expect(page.getByRole("region", { name: "Ausgewählt" })).toContainText("Gurke");
  // Two cakes for an invitation, outside the meals.
  await page.goto(`/woche/auswahl?w=${WEEK}&ziel=extra&q=mohn`);
  await page.getByRole("button", { name: "Zitronen-Mohn-Kuchen einplanen" }).click();
  await page.getByRole("button", { name: "Mehr von Zitronen-Mohn-Kuchen" }).click();
  await expect(page.getByRole("region", { name: "Außerdem" })).toContainText("2 Springform");

  await page.getByRole("link", { name: "Einkauf", exact: true }).click();
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(page.getByRole("heading", { name: "1.–7. März" })).toBeVisible();
  // Supermarket on Monday and Friday, market on Saturday, and the market before the week,
  // because it buys for Monday and Tuesday.
  const days = page.getByRole("navigation", { name: "Einkaufstag" });
  await expect(days.getByRole("link")).toHaveText([
    "Alle Tage",
    /^Sa 27\. Markt/,
    /^Mo 1\./,
    /^Fr 5\./,
    /^Sa 6\. Markt/,
    "Zum Wochenplan",
    "Als PDF",
  ]);

  // What is fresh comes from the market and the butcher: the steaks keep until Monday.
  await expect(sheet(page, MARKET)).toContainText("Markt & Metzger · für Montag bis Dienstag");
  await expect(group(page, MARKET, "Fleisch & Wurst")).toContainText("4 Rindersteaks");
  await expect(group(page, MARKET, "Obst & Gemüse")).toContainText("2 Karotten");
  await expect(group(page, MARKET, "Obst & Gemüse")).toContainText("Kartoffeln");
  // "Gurke" was asked for: one of them.
  await expect(group(page, MARKET, "Obst & Gemüse")).toContainText("1 Gurke");
  // Everything else comes from the supermarket on Monday. Which one plays no part.
  await expect(sheet(page, MONDAY)).toContainText("Supermarkt");
  await expect(sheet(page, MONDAY).getByRole("region", { name: "Aldi" })).toHaveCount(0);
  await expect(group(page, MONDAY, "Obst & Gemüse")).toHaveCount(0);
  // 200 ml and 100 ml of cream are two packs of 200 ml.
  await expect(sheet(page, MONDAY).getByText("2x Sahne")).toBeVisible();
  // The supper's bread comes from the bakery.
  await expect(group(page, MONDAY, "Brot & Backwaren")).toContainText("Brot · Bäcker");
  // Two cakes need 8 eggs, bought as a box of ten, on the week's first supermarket day.
  await expect(sheet(page, MONDAY).getByText("10 Eier")).toBeVisible();
  await expect(sheet(page, "Freitag, 5. März")).toContainText("Nichts zu kaufen.");

  // Where a line comes from is one tap away.
  await page.getByText("10 Eier").click();
  await expect(page.getByText("Genau: 8 Stück")).toBeVisible();
  await expect(
    page.locator("li:visible", { hasText: /^Außerdem: Zitronen-Mohn-Kuchen$/ }),
  ).toHaveCount(1);

  // Salt is assumed to be at home, and can be put on the list after all.
  await expect(group(page, MONDAY, "Gewürze, Öl & Essig")).toHaveCount(0);
  await sheet(page, MONDAY)
    .getByText(/Haben wir schon \(\d+\)/)
    .click();
  await page.getByRole("button", { name: "Salz doch kaufen" }).click();
  await expect(group(page, MONDAY, "Gewürze, Öl & Essig")).toContainText("Salz");

  // Lines written by hand onto one day's list: one the catalog knows, with its note, and
  // one it does not.
  const write = page.getByLabel(`Auf den Zettel für ${MONDAY} schreiben`);
  await write.fill("Milch WS 1.29");
  await write.press("Enter");
  await expect(sheet(page, MONDAY).getByText("Milch WS 1.29", { exact: true })).toBeVisible();
  await write.fill("Geschenkpapier");
  await write.press("Enter");
  await expect(sheet(page, MONDAY).getByText("Geschenkpapier", { exact: true })).toBeVisible();
  await expect(sheet(page, MARKET)).not.toContainText("Geschenkpapier");

  // Ticking off, and the tick survives a change of the plan.
  await page.getByRole("button", { name: "4 Rindersteaks: erledigt" }).click();
  await expect(sheet(page, MARKET)).toContainText("1 erledigt");
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("button", { name: "Dienstag Mittag leeren" }).click();
  // The meal is open again. The soup may still show there as a pale idea, so that is what
  // is looked for, not the absence of its name.
  await expect(page.getByRole("link", { name: "Dienstag Mittag planen" })).toBeVisible();
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(page.getByText("2 Karotten")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "4 Rindersteaks: wieder offen" })).toBeVisible();
  await expect(page.getByText("Milch WS 1.29", { exact: true })).toBeVisible();

  // One day alone, as it is taken to the shop.
  await days.getByRole("link", { name: /^Montag, 1\. März/ }).click();
  await expect(sheet(page, MONDAY)).toBeVisible();
  await expect(sheet(page, MARKET)).toHaveCount(0);

  // The same lists as a PDF.
  const pdf = await page.request.get(`/einkauf/pdf?w=${WEEK}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a week with nothing planned has empty lists that say where they come from", async ({
  page,
}) => {
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(
    page.getByText("Für diese Woche steht noch nichts auf den Einkaufszetteln."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Als PDF" })).toHaveCount(0);
});

test("what ran out at home is noted and put on the next shopping day's list", async ({ page }) => {
  // The note is one tap away from every page.
  await page.goto("/rezepte");
  await page.getByRole("link", { name: /^Merkzettel/ }).click();
  await expect(page.getByRole("heading", { name: "Merkzettel" })).toBeVisible();
  await expect(page.getByText("Es steht nichts darauf.")).toBeVisible();

  const write = page.getByLabel("Auf den Merkzettel schreiben");
  for (const text of ["Mehl", "Spülmittel"]) {
    await write.fill(text);
    await write.press("Enter");
    await expect(
      page.getByRole("button", { name: `${text} auf den Einkaufszettel` }),
    ).toBeVisible();
  }
  // Written a second time, it is still one entry.
  await write.fill("mehl");
  await write.press("Enter");
  await expect(page.getByRole("link", { name: "Merkzettel, 2 Einträge" })).toBeVisible();

  // One entry goes to the list of the next shopping day and leaves the note.
  await page.getByRole("button", { name: "Mehl auf den Einkaufszettel" }).click();
  const moved = page.getByRole("status");
  await expect(moved).toContainText("Steht auf dem Einkaufszettel für");
  await expect(page.getByRole("button", { name: "Mehl auf den Einkaufszettel" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Merkzettel, 1 Eintrag" })).toBeVisible();
  await moved.getByRole("link").click();
  await expect(page.getByText("Mehl", { exact: true })).toBeVisible();
  // The rest of the note shows next to the lists, and can be struck there.
  await page.getByRole("button", { name: "Spülmittel streichen" }).click();
  await expect(page.getByRole("region", { name: "Merkzettel" })).toHaveCount(0);
  await expect(page.getByText("Mehl", { exact: true })).toBeVisible();
});

test("what one device changes shows on another without reloading", async ({
  page,
  browser,
  baseURL,
}) => {
  // A second device of the same household, signed in by itself.
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await signIn(other);
  await other.goto("/merkzettel");
  await expect(other.getByText("Es steht nichts darauf.")).toBeVisible();
  // Give the second device the moment it needs to start listening.
  await other.waitForTimeout(2000);

  await page.goto("/merkzettel");
  const write = page.getByLabel("Auf den Merkzettel schreiben");
  await write.fill("Hefe");
  await write.press("Enter");
  await expect(page.getByRole("button", { name: "Hefe streichen" })).toBeVisible();

  // The other device shows it without anyone touching it, in the note and in the header.
  await expect(other.getByRole("button", { name: "Hefe streichen" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(other.getByRole("link", { name: "Merkzettel, 1 Eintrag" })).toBeVisible();

  await other.getByRole("button", { name: "Hefe streichen" }).click();
  await expect(page.getByText("Es steht nichts darauf.")).toBeVisible({ timeout: 15_000 });
  await context.close();
});
