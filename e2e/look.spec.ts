import { test } from "@playwright/test";

// Not a test of behaviour: walks through the screens and saves pictures of them, to look at
// what was built. Run with `npm run e2e:look`.
test("screens @look", async ({ page }, info) => {
  const shot = async (name: string) =>
    page.screenshot({ path: `test-results/look/${info.project.name}-${name}.png`, fullPage: true });

  await page.goto("/");
  await shot("1-login");
  await page.getByLabel("E-Mail").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/rezepte");
  await shot("2-rezepte");

  await page.goto("/import");
  await shot("3-import");
  const batch = page
    .locator('a[href^="/import/"]:not([href*="pruefen"]):not([href*="vorschlaege"])')
    .first();
  if (await batch.count()) {
    await batch.click();
    await page.waitForLoadState("networkidle");
    await shot("4-stapel");
  }
  await page.goto("/import/pruefen");
  await page.waitForLoadState("networkidle");
  await shot("5-pruefen");
  await page.goto("/import/vorschlaege");
  await shot("6-vorschlaege");
});
