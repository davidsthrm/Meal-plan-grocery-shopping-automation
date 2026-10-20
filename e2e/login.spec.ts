import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

test("nothing is reachable without a login", async ({ page }) => {
  for (const path of [
    "/",
    "/woche",
    "/woche/auswahl",
    "/rezepte",
    "/import",
    "/import/vorschlaege",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  const step = await page.request.post("/api/import/00000000-0000-4000-8000-000000000000/step", {
    maxRedirects: 0,
  });
  expect(step.status()).toBe(307);
});

test("a wrong password is refused without saying which part was wrong", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Passwort").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail oder Passwort stimmt nicht.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("signing in opens the week plan, signing out closes it again", async ({ page }) => {
  await signIn(page);
  // The test user has a name: the plan greets them and is called "Euer Wochenplan".
  await expect(page.getByRole("heading", { level: 1, name: /Wochenplan/ })).toBeVisible();
  // Signing out is in the settings only, not on every page.
  await expect(page.getByRole("button", { name: "Abmelden" })).toHaveCount(0);
  await page
    .getByRole("link", { name: /Einstellungen/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/rezepte");
  await expect(page).toHaveURL(/\/login$/);
});
