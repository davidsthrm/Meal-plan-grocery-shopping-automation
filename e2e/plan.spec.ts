import { expect, test, type Page } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-03-01";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

const meal = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const count = async (page: Page, group: string) => {
  const line = page
    .getByRole("list", { name: "Ausgewogenheit der Woche" })
    .getByRole("listitem")
    .filter({ hasText: group });
  return Number((await line.innerText()).match(/\d+/)?.[0]);
};

test("an empty week comes with a suggestion for every meal and says why", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await expect(page.getByRole("heading", { name: "1.–7. März" })).toBeVisible();
  await expect(page.getByText("Vorschlag", { exact: true })).toHaveCount(14);
  // Nothing is planned yet, so the first suggestion is there to fill a gap.
  await expect(meal(page, "Montag Mittag")).toContainText("fehlt diese Woche noch");

  await meal(page, "Montag Mittag")
    .getByRole("button", { name: /übernehmen/ })
    .click();
  await expect(meal(page, "Montag Mittag")).toContainText("4 Personen");
  await expect(meal(page, "Montag Mittag")).not.toContainText("Vorschlag");

  await page.getByRole("button", { name: "Alle 13 Vorschläge übernehmen" }).click();
  await expect(page.getByText("Vorschlag", { exact: true })).toHaveCount(0);
  // Together the suggestions make a week that meets what the household aims for.
  expect(await count(page, "Vegetarisch")).toBeGreaterThanOrEqual(3);
  expect(await count(page, "Fisch")).toBeGreaterThanOrEqual(1);
  expect(await count(page, "Fleisch")).toBeLessThanOrEqual(2);
  expect(await count(page, "Geflügel")).toBeLessThanOrEqual(2);
});

test("a meal can be something without a recipe, and be emptied again", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await expect(page.getByRole("heading", { name: "Abendessen planen" })).toBeVisible();
  await page.getByRole("button", { name: "Vesper" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("Vesper");

  await page.getByRole("link", { name: "Montag Abend ändern" }).click();
  await page.getByLabel("Eigener Eintrag").fill("bei Oma");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("bei Oma");
  await expect(meal(page, "Montag Abend")).not.toContainText("Vesper");

  await page.getByRole("button", { name: "Montag Abend leeren" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("Vorschlag");
});

test("a cake is planned as written, and a side dish can join a meal", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Dienstag Mittag planen" }).click();
  await page.getByPlaceholder("Titel oder Zutat").fill("kuchen");
  await page.getByRole("button", { name: "Suchen" }).click();
  await page.getByRole("button", { name: "Zitronen-Mohn-Kuchen einplanen" }).click();

  // One cake tin, not four of them for four persons.
  const tuesday = meal(page, "Dienstag Mittag");
  await expect(tuesday).toContainText("1 Springform (Ø 26 cm)");
  await page.getByRole("button", { name: "Mehr von Zitronen-Mohn-Kuchen" }).click();
  await expect(tuesday).toContainText("2 Springform (Ø 26 cm)");

  await page.getByRole("link", { name: "Dienstag Mittag: etwas dazu" }).click();
  await expect(page.getByRole("heading", { name: "Zum Mittagessen dazu" })).toBeVisible();
  await page.getByRole("link", { name: "Vegan", exact: true }).click();
  await page.getByRole("button", { name: "Tomatensalat einplanen" }).click();
  await expect(tuesday).toContainText("Zitronen-Mohn-Kuchen");
  await expect(tuesday).toContainText("Tomatensalat");
  await expect(tuesday).toContainText("4 Personen");
});

test("a recipe found while browsing is put on the plan from its own page", async ({ page }) => {
  await page.goto("/rezepte");
  // "Rindersteak" is in no title: the search also looks at the ingredients.
  await page.getByPlaceholder("Titel oder Zutat").fill("Rindersteak");
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await page.getByRole("link", { name: /Pfeffersteak/ }).click();
  await page.getByRole("link", { name: "Einplanen" }).click();

  await expect(page.getByText("einplanen: Mahlzeit wählen.")).toBeVisible();
  await page.getByRole("button", { name: "Sonntag Abend: hier einplanen" }).click();
  await expect(meal(page, "Sonntag Abend")).toContainText("Pfeffersteak");
  await expect(page.getByText("einplanen: Mahlzeit wählen.")).toHaveCount(0);
});

test("last week is a starting point for the next one", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await meal(page, "Montag Mittag")
    .getByRole("button", { name: /übernehmen/ })
    .click();
  await expect(meal(page, "Montag Mittag")).toContainText("4 Personen");
  const cooked = await meal(page, "Montag Mittag").getByRole("link").first().innerText();
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await page.getByRole("button", { name: "Reste" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("Reste");

  await page.getByRole("link", { name: "Nächste" }).click();
  await expect(page.getByRole("heading", { name: "8.–14. März" })).toBeVisible();
  await page.getByRole("button", { name: "Letzte Woche übernehmen" }).click();
  await expect(meal(page, "Montag Mittag")).toContainText(cooked);
  await expect(meal(page, "Montag Abend")).toContainText("Reste");
});
