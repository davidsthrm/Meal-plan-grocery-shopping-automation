import { expect, test } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

test("the library is laid out on shelves and can be narrowed down", async ({ page }) => {
  await page.goto("/rezepte");
  await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
  await expect(page.getByText("20 Rezepte im Kochbuch")).toBeVisible();
  await expect(page.getByRole("region", { name: "Favoriten", exact: true })).toContainText(
    "Gemüse-Lasagne",
  );
  await expect(page.getByRole("region", { name: "Zweites Buch" })).toBeVisible();

  // A shelf shows a few; its link lists all of them.
  await page
    .getByRole("region", { name: "Hauptgericht", exact: true })
    .getByRole("link", { name: "Alle 15" })
    .click();
  await expect(page.getByRole("status")).toHaveText("15 Rezepte passen dazu");

  await page.getByRole("link", { name: "Fisch", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");
  await page.getByRole("link", { name: "bis 20 Min." }).click();
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await expect(page.getByRole("link", { name: /Lachs mit Currysahne/ })).toBeVisible();

  await page.getByRole("link", { name: "Alle Filter zurücksetzen" }).click();
  await expect(page.getByRole("region", { name: "Favoriten", exact: true })).toBeVisible();
});

test("the search finds a title however it is spelled", async ({ page }) => {
  await page.goto("/rezepte");
  await page.getByPlaceholder("Titel oder Zutat").fill("kurbis");
  await page.getByPlaceholder("Titel oder Zutat").press("Enter");
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await expect(page.getByRole("link", { name: /Kürbisgnocchi/ })).toBeVisible();

  await page.getByPlaceholder("Titel oder Zutat").fill("gibt es nicht");
  await page.getByPlaceholder("Titel oder Zutat").press("Enter");
  await expect(page.getByRole("status")).toHaveText("Kein Rezept passt dazu.");
});

test("a favourite is one tap and leads its shelves from then on", async ({ page }) => {
  await page.goto("/rezepte?q=Pfeffersteak");
  await page.getByRole("link", { name: /Pfeffersteak/ }).click();
  await page.getByRole("button", { name: "Als Favorit merken" }).click();
  await expect(page.getByRole("button", { name: "Favorit", exact: true })).toBeVisible();

  await page.goto("/rezepte");
  await expect(page.getByRole("region", { name: "Favoriten", exact: true })).toContainText(
    "Pfeffersteak",
  );
  await page.getByRole("link", { name: "Favoriten", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");
});
