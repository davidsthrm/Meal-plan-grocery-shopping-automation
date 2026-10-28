import { expect, test } from "@playwright/test";
import { resetHousehold, signIn, startHouseholdOn } from "./fixtures";

test.afterEach(async () => {
  await resetHousehold();
});

test("the weeks go back no further than the one the household started with", async ({ page }) => {
  await resetHousehold();
  await startHouseholdOn("2026-10-19");
  await signIn(page);

  // An older week in the address is the first week instead.
  await page.goto("/woche?w=2026-10-05");
  await expect(page.getByRole("heading", { name: /19\.–25\. Oktober/ })).toBeVisible();
  const plan = page.getByRole("navigation", { name: "Woche wechseln" });
  await expect(plan.getByLabel("Vorige Woche")).toHaveAttribute("aria-disabled", "true");
  await expect(plan.getByRole("link", { name: "Nächste Woche" })).toBeVisible();

  await page.goto("/einkauf?w=2026-10-12");
  const notes = page.getByRole("navigation", { name: "Woche wechseln" });
  await expect(notes.getByLabel("Vorige Woche")).toHaveAttribute("aria-disabled", "true");
  await expect(notes.getByRole("link", { name: "Nächste Woche" })).toBeVisible();

  await page.goto("/woche/verlauf");
  await expect(page.getByRole("link", { name: "Ältere Wochen anzeigen" })).toHaveCount(0);
});
