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

const group = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("the week becomes a shopping list, grouped by kind of grocery, to work through", async ({
  page,
}) => {
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
  await expect(page.getByText("Einkauf am Montag, 1. März")).toBeVisible();

  // One list by kind of grocery; which supermarket a thing comes from plays no part.
  await expect(group(page, "Aldi")).toHaveCount(0);
  await expect(group(page, "E-Center")).toHaveCount(0);
  // Counted things show their number, packs only when more than one is needed.
  await expect(group(page, "Fleisch & Wurst")).toContainText("4 Rindersteaks");
  await expect(group(page, "Obst & Gemüse")).toContainText("2 Karotten");
  await expect(group(page, "Obst & Gemüse")).toContainText("Kartoffeln");
  // 200 ml and 100 ml of cream are two packs of 200 ml.
  await expect(page.getByText("2x Sahne")).toBeVisible();
  // "Gurke" was asked for: one of them. The supper's bread comes from the bakery.
  await expect(group(page, "Obst & Gemüse")).toContainText("1 Gurke");
  await expect(group(page, "Brot & Backwaren")).toContainText("Brot · Bäcker");
  // Two cakes need 8 eggs, bought as a box of ten, and 500 g of butter.
  await expect(page.getByText("10 Eier")).toBeVisible();

  // Where a line comes from is one tap away.
  await page.getByText("10 Eier").click();
  await expect(page.getByText("Genau: 8 Stück")).toBeVisible();
  // The butter line says the same, but is not open.
  await expect(
    page.locator("li:visible", { hasText: /^Außerdem: Zitronen-Mohn-Kuchen$/ }),
  ).toHaveCount(1);

  // Salt is assumed to be at home, and can be put on the list after all.
  await expect(group(page, "Gewürze, Öl & Essig")).toHaveCount(0);
  await page.getByText(/Haben wir schon \(\d+\)/).click();
  await page.getByRole("button", { name: "Salz doch kaufen" }).click();
  await expect(group(page, "Gewürze, Öl & Essig")).toContainText("Salz");

  // Lines written by hand: one the catalog knows, with its note, and one it does not.
  await page.getByLabel("Etwas dazuschreiben").fill("Milch WS 1.29");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("Milch WS 1.29", { exact: true })).toBeVisible();
  await page.getByLabel("Etwas dazuschreiben").fill("Geschenkpapier");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("Geschenkpapier", { exact: true })).toBeVisible();

  // Ticking off, and the tick survives a change of the plan.
  await page.getByRole("button", { name: "4 Rindersteaks: erledigt" }).click();
  await expect(page.getByText("1 erledigt")).toBeVisible();
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("button", { name: "Dienstag Mittag leeren" }).click();
  // The meal is open again. The soup may still show there as a pale idea, so that is what
  // is looked for, not the absence of its name.
  await expect(page.getByRole("link", { name: "Dienstag Mittag planen" })).toBeVisible();
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(page.getByText("2 Karotten")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "4 Rindersteaks: wieder offen" })).toBeVisible();
  await expect(page.getByText("Milch WS 1.29", { exact: true })).toBeVisible();

  // The same list as a PDF.
  const pdf = await page.request.get(`/einkauf/pdf?w=${WEEK}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a week with nothing planned has an empty list that says where it comes from", async ({
  page,
}) => {
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(page.getByText("Für diese Woche steht noch nichts auf der Liste.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Als PDF" })).toHaveCount(0);
});
