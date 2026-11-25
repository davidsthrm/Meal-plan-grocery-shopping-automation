import { expect, test } from "@playwright/test";
import { plannedItems, resetLibrary, signIn } from "./fixtures";
import { meal, plan } from "./helpers";

// Changes to one meal of the week: its persons, its extra portions, emptying it and taking
// that back (audit, 24 November 2026).

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-05-10";

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's screen");
  await resetLibrary();
  await signIn(page);
});

test("an emptied meal comes back with Widerrufen, with its persons and its leftovers", async ({
  page,
}) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Dienstag Mittag", "Kartoffelsuppe");
  const lunch = meal(page, "Dienstag Mittag");
  await lunch.getByRole("button", { name: "Mehr von Kartoffelsuppe" }).click();
  await expect(lunch).toContainText("5 Personen");
  await expect(lunch.locator('[aria-busy="true"]')).toHaveCount(0);
  await lunch.getByRole("link", { name: "Dienstag Mittag: mehr kochen" }).click();
  await lunch.getByRole("button", { name: "Übernehmen" }).click();
  const evening = meal(page, "Dienstag Abend");
  await expect(evening).toContainText("Reste von Di Mittag");
  // Back to no extra portions and cooked for leftovers again: a second meal of leftovers.
  const fewer = lunch.getByRole("button", { name: "Dienstag Mittag: eine Extra-Portion weniger" });
  for (const left of ["3 Extra-Portionen", "2 Extra-Portionen", "1 Extra-Portion"]) {
    await fewer.click();
    await expect(lunch).toContainText(left);
  }
  await fewer.click();
  await lunch.getByRole("link", { name: "Dienstag Mittag: mehr kochen" }).click();
  await lunch.getByRole("button", { name: "Übernehmen" }).click();
  const wednesday = meal(page, "Mittwoch Mittag");
  await expect(wednesday).toContainText("Reste von Di Mittag");

  // The bin empties it at once, and says so with a way back.
  await lunch.getByRole("button", { name: "Dienstag Mittag leeren" }).click();
  const bar = page.getByRole("status").filter({ hasText: "Di Mittag geleert" });
  await expect(bar).toBeVisible();
  await expect(lunch.getByRole("link", { name: "Dienstag Mittag planen" })).toBeVisible();
  await expect(evening).not.toContainText("von Di Mittag");
  await expect(wednesday).not.toContainText("von Di Mittag");

  await bar.getByRole("button", { name: "Widerrufen" }).click();
  await expect(lunch).toContainText("Kartoffelsuppe");
  await expect(lunch).toContainText("5 Personen");
  await expect(lunch).toContainText("4 Extra-Portionen");
  // Both meals of leftovers know again which meal they are from.
  await expect(evening).toContainText("Reste von Di Mittag");
  await expect(wednesday).toContainText("Reste von Di Mittag");
});

test("the last recipe stepped to nothing empties the meal with the same way back", async ({
  page,
}) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Mittwoch Mittag", "Pilzrisotto");
  const lunch = meal(page, "Mittwoch Mittag");
  const fewer = lunch.getByRole("button", { name: "Weniger von Pilzrisotto" });
  for (let tap = 0; tap < 4; tap++) await fewer.click();
  const bar = page.getByRole("status").filter({ hasText: "Mi Mittag geleert" });
  await expect(bar).toBeVisible();
  await expect(lunch.getByRole("link", { name: "Mittwoch Mittag planen" })).toBeVisible();
  await bar.getByRole("button", { name: "Widerrufen" }).click();
  await expect(lunch).toContainText("Pilzrisotto");
});

test("a step of the persons changes the recipe's row, not a new one", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Montag Mittag", "Pilzrisotto");
  const [before] = await plannedItems();
  await meal(page, "Montag Mittag").getByRole("button", { name: "Mehr von Pilzrisotto" }).click();
  await expect.poll(plannedItems).toEqual([{ id: before.id, servings: 5 }]);
});

test("quick taps on the extra portions all count", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Montag Mittag", "Pilzrisotto");
  const lunch = meal(page, "Montag Mittag");
  await lunch.getByRole("link", { name: "Montag Mittag: mehr kochen" }).click();
  await lunch.getByRole("button", { name: "Übernehmen" }).click();
  await expect(lunch).toContainText("4 Extra-Portionen");
  const more = lunch.getByRole("button", { name: "Montag Mittag: eine Extra-Portion mehr" });
  // One after the other without waiting for the server: none of them is refused.
  for (let tap = 0; tap < 3; tap++) await more.click({ force: true });
  await expect(lunch).toContainText("7 Extra-Portionen");
  await expect(lunch.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.reload();
  await expect(meal(page, "Montag Mittag")).toContainText("7 Extra-Portionen");
});

test("food chips stay where they are and are tapped on and off", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await page.getByRole("button", { name: "Vesper" }).click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await page.getByRole("link", { name: "Montag Abend: Lebensmittel" }).click();

  const where = async (name: string) => {
    const box = await page.getByRole("button", { name }).boundingBox();
    return { x: Math.round(box!.x), y: Math.round(box!.y) };
  };
  const butter = await where("Butter hinzufügen");
  const cucumber = await where("Gurke hinzufügen");
  // Quickly, one after the other: each lands on the food it was meant for.
  await page.getByRole("button", { name: "Brot hinzufügen" }).click();
  await page.getByRole("button", { name: "Butter hinzufügen" }).click();
  await page.getByRole("button", { name: "Gurke hinzufügen" }).click();
  for (const food of ["Brot", "Butter", "Gurke"]) {
    await expect(page.getByRole("button", { name: `${food} entfernen` })).toBeVisible();
  }
  expect(await where("Butter entfernen")).toEqual(butter);
  expect(await where("Gurke entfernen")).toEqual(cucumber);
  await expect(page.getByRole("button", { name: /entfernen$/ })).toHaveCount(3);

  // A second tap takes it off again, in its place.
  await page.getByRole("button", { name: "Butter entfernen" }).click();
  await expect(page.getByRole("button", { name: "Butter hinzufügen" })).toBeVisible();
  expect(await where("Butter hinzufügen")).toEqual(butter);
  await page.getByRole("link", { name: "Fertig" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("Brot, Gurke");
});
