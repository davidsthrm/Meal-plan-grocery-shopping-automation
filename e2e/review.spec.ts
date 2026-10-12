import { expect, test } from "@playwright/test";
import { resetImportData, signIn } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetImportData();
  await signIn(page);
});

test("a recipe that needs a decision is reviewed, corrected and lands in the library", async ({
  page,
}) => {
  await page.goto("/import");
  await page.getByRole("link", { name: "1 Rezept prüfen" }).click();

  await expect(page.getByText("Auf dem Foto steht kein Titel. Bitte trage ihn ein.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Foto 1 des Rezepts" })).toBeVisible();
  await expect(page.getByText("Gedruckt: 300 g Topinambur")).toBeVisible();
  await expect(page.getByText("Steht noch nicht im Katalog.")).toHaveCount(1);

  // Without a title it cannot be approved, and the form says why.
  await page.getByRole("button", { name: "Stimmt so, übernehmen" }).click();
  await expect(page.getByText("Bitte einen Titel eingeben.")).toBeVisible();

  await page.getByLabel("Titel").fill("Kartoffelsuppe mit Topinambur");
  await page.getByLabel("Menge", { exact: true }).first().fill("750");
  await page.getByRole("button", { name: "Stimmt so, übernehmen" }).click();

  // Nothing else waits, so it goes back to the batch.
  await expect(page.getByRole("heading", { name: "E2E Kochbuch" })).toBeVisible();
  await expect(page.getByText("übernommen", { exact: true })).toBeVisible();

  await page.goto("/rezepte");
  await page.getByRole("link", { name: /Kartoffelsuppe mit Topinambur/ }).click();
  await expect(page.getByRole("heading", { name: "Kartoffelsuppe mit Topinambur" })).toBeVisible();
  await expect(page.getByText("750 g")).toBeVisible();
  await expect(page.getByText("E2E Kochbuch, S. 12")).toBeVisible();
});

test("unknown ingredients are decided in one list and one step", async ({ page }) => {
  await page.goto("/import/vorschlaege");
  await expect(page.getByText("Topinambur", { exact: true })).toBeVisible();
  await expect(page.getByText("Pak Choi", { exact: true })).toBeVisible();

  // One is really another name for something the catalog has, the other is new.
  await page.getByLabel("Entscheidung für Topinambur").selectOption("same");
  await page.getByLabel("Topinambur ist dasselbe wie").fill("Kartoffeln");
  await page.getByRole("button", { name: "Alle 2 Entscheidungen übernehmen" }).click();
  await expect(page.getByText("Keine offenen Vorschläge.")).toBeVisible();

  // The recipe line that waited now belongs to the catalog ingredient.
  await page.goto("/import/pruefen");
  await expect(page.getByText("Gedruckt: 300 g Topinambur")).toBeVisible();
  await expect(page.getByText("Steht noch nicht im Katalog.")).toHaveCount(0);
  await expect(page.getByLabel("Zutat").nth(1)).toHaveValue("Kartoffeln");
});

test("a decision can be left for later, and a wrong one is refused", async ({ page }) => {
  await page.goto("/import/vorschlaege");
  await page.getByLabel("Entscheidung für Pak Choi").selectOption("later");
  await page.getByLabel("Entscheidung für Topinambur").selectOption("same");
  await page.getByLabel("Topinambur ist dasselbe wie").fill("Gibt es nicht");
  await page.getByRole("button", { name: "1 Entscheidung übernehmen" }).click();
  await expect(page.getByText("Diese Zutat gibt es im Katalog nicht.")).toBeVisible();
  await expect(page.getByText("Pak Choi", { exact: true })).toBeVisible();
});

test("a photo that is no recipe can be thrown out", async ({ page }) => {
  await page.goto("/import/pruefen");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Kein Rezept" }).click();
  await expect(page.getByText("verworfen")).toBeVisible();
  await page.goto("/rezepte");
  await expect(page.getByText("Noch keine Rezepte.")).toBeVisible();
});

test("a batch can be deleted together with what was read from it", async ({ page }) => {
  await page.goto("/import");
  await page.getByRole("link", { name: /E2E Kochbuch/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Stapel löschen" }).click();
  await expect(page.getByRole("heading", { name: "Rezepte einlesen" })).toBeVisible();
  await expect(page.getByRole("link", { name: /E2E Kochbuch/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Rezept prüfen/ })).toHaveCount(0);
});
