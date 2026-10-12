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

test("an unknown ingredient is confirmed once and then belongs to the catalog", async ({
  page,
}) => {
  await page.goto("/import/vorschlaege");
  await expect(page.getByRole("heading", { name: "Topinambur" })).toBeVisible();
  await expect(page.getByText("Kommt vor in: Ohne Titel")).toBeVisible();

  const card = page.getByRole("listitem").filter({ hasText: "Kommt vor in: Ohne Titel" });
  await card.getByLabel("Hält sich (Tage, leer = lange)").fill("14");
  await card.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Topinambur" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pak Choi" })).toBeVisible();

  // The recipe line now points at the new ingredient, so the hint is gone in review.
  await page.goto("/import/pruefen");
  await expect(page.getByText("Gedruckt: 300 g Topinambur")).toBeVisible();
  await expect(page.getByText("Steht noch nicht im Katalog.")).toHaveCount(0);
});

test("several new ingredients are accepted in one go, as suggested", async ({ page }) => {
  await page.goto("/import/vorschlaege");
  await page
    .getByRole("button", { name: "Alle 2 neuen Zutaten wie vorgeschlagen übernehmen" })
    .click();
  await expect(page.getByText("Keine offenen Vorschläge.")).toBeVisible();
});

test("a photo that is no recipe can be thrown out", async ({ page }) => {
  await page.goto("/import/pruefen");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Kein Rezept" }).click();
  await expect(page.getByText("verworfen")).toBeVisible();
  await page.goto("/rezepte");
  await expect(page.getByText("Noch keine Rezepte.")).toBeVisible();
});
