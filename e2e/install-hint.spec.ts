import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

test("Safari is told how to put the app on the home screen, until the hint is put away", async ({
  page,
}) => {
  // Safari on an iPhone has `navigator.standalone`, false in the browser.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "standalone", { value: false, configurable: true });
  });
  await signIn(page);
  await page.goto("/woche");
  const hint = page.getByRole("complementary", { name: "Als App auf dem Home-Bildschirm" });
  await expect(hint).toContainText("„Zum Home-Bildschirm“");
  await expect(hint).toContainText("einmal neu an");
  await hint.getByRole("button", { name: "Hinweis schließen" }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(hint).toHaveCount(0);
});

test("the installed app shows no such hint", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "standalone", { value: true, configurable: true });
  });
  await signIn(page);
  await page.goto("/woche");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: /Home-Bildschirm/ })).toHaveCount(0);
});
