import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { resetImportData, signIn } from "./fixtures";

const PHOTOS = ["samples/recipes/IMG_5683.heic", "samples/recipes/IMG_5684.heic"];

// The whole way through the browser with real photos and the real models: upload, reading,
// result. Calls the API (about one cent) and needs the private sample photos, so it only runs
// on request: `npm run e2e:upload`.
test("a batch of iPhone photos is uploaded, read and sorted @api", async ({ page }) => {
  test.skip(!PHOTOS.every((photo) => existsSync(photo)), "sample photos are not on this machine");
  test.setTimeout(240_000);
  await resetImportData();
  await signIn(page);

  await page.goto("/import");
  await page.getByLabel("Kochbuch").fill("Upload-Test");
  // The batch's own field: above it, one recipe has a camera of its own.
  await page.locator('label:has-text("Fotos auswählen") input').setInputFiles(PHOTOS);
  await expect(page.getByText("2 Fotos: IMG_5683.heic bis IMG_5684.heic")).toBeVisible();
  await page.getByRole("button", { name: "Hochladen und einlesen" }).click();

  await expect(page.getByRole("heading", { name: "Upload-Test" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Wird eingelesen …")).toBeVisible();
  // One page has its title printed and is taken over; the other has none and waits.
  await expect(page.getByRole("link", { name: "1 Rezept prüfen" })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByRole("link", { name: /Linsen-Eintopf.*übernommen/ })).toBeVisible();
  await expect(page.getByText("2 Fotos · 1 übernommen · 1 zu prüfen")).toBeVisible();

  await page.getByRole("link", { name: /Linsen-Eintopf/ }).click();
  await expect(page.getByText("Upload-Test, S. 84")).toBeVisible();
  await expect(page.getByText("1,25 l")).toBeVisible();
  // The photographed page is folded away until asked for.
  await page.getByText("Originalfoto").click();
  await expect(page.getByAltText("Seite 1 von Linsen-Eintopf")).toBeVisible();
});
