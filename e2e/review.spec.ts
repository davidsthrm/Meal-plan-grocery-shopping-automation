import { expect, test } from "@playwright/test";
import { resetImportData, signIn, uploadIsFor } from "./fixtures";

let waiting: { jobId: string; batchId: string };

test.beforeEach(async ({ page }) => {
  waiting = await resetImportData();
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
  // The recipe does not count persons: it fills six jars.
  await page.getByLabel("Reicht für").fill("6");
  await page.getByLabel("statt Personen").fill("Gläser");
  await page.getByRole("button", { name: "Stimmt so, übernehmen" }).click();

  // Nothing else waits, so it goes back to the batch.
  await expect(page.getByRole("heading", { name: "E2E Kochbuch" })).toBeVisible();
  await expect(page.getByText("übernommen", { exact: true })).toBeVisible();

  await page.goto("/rezepte");
  // The one recipe of the library stands on several shelves.
  const card = page.getByRole("link", { name: /Kartoffelsuppe mit Topinambur/ }).first();
  await expect(card).toContainText("6 Gläser");
  await card.click();
  await expect(page.getByRole("heading", { name: "Kartoffelsuppe mit Topinambur" })).toBeVisible();
  await expect(page.getByText("750 g")).toBeVisible();
  await expect(page.getByText("6 Gläser")).toBeVisible();
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

test("a meal planned as text gets its recipe from an upload started there", async ({ page }) => {
  const lunch = page.getByRole("region", { name: "Mittwoch Mittag", exact: true });
  await page.goto("/woche?w=2027-03-01");
  await page.getByRole("link", { name: "Mittwoch Mittag planen" }).click();
  await page.getByLabel("Eigener Eintrag").fill("Topinambursuppe");
  await page.getByRole("button", { name: "Eintragen" }).click();

  // The cookbook has no such recipe: the meal says so and offers to upload the page.
  await expect(lunch).toContainText("Noch kein Rezept dazu");
  await page.getByRole("link", { name: "Mittwoch Mittag: Rezept hochladen" }).click();
  await expect(
    page.getByRole("heading", { name: "Rezept für Mittwoch Mittag: Topinambursuppe" }),
  ).toBeVisible();

  // The photo was uploaded from there and read; its recipe waits for a title.
  await uploadIsFor(waiting.batchId, "2027-03-03", "lunch");
  await page.goto(`/import/${waiting.batchId}`);
  await expect(page.getByText("Für Mittwoch Mittag: Topinambursuppe")).toBeVisible();
  await page.goto(`/import/pruefen/${waiting.jobId}`);
  await page.getByLabel("Titel").fill("Topinambursuppe");
  await page.getByRole("button", { name: "Stimmt so, übernehmen" }).click();

  // Approved, the recipe stands on the meal instead of the text.
  await page.waitForURL("**/woche?w=2027-03-01**");
  await expect(lunch.getByRole("link", { name: "Topinambursuppe" })).toBeVisible();
  await expect(lunch).not.toContainText("Noch kein Rezept dazu");
  // The batch has done what it was uploaded for.
  await page.goto(`/import/${waiting.batchId}`);
  await expect(page.getByText("übernommen", { exact: true })).toBeVisible();
  await expect(page.getByText("Für Mittwoch Mittag")).toHaveCount(0);
});
