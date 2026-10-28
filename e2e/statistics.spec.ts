import { expect, test, type Page } from "@playwright/test";
import { planHistory, resetHousehold, resetLibrary, signIn } from "./fixtures";

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const control = (page: Page, nav: "Bereich" | "Zeitraum", name: string) =>
  page.getByRole("navigation", { name: nav, exact: true }).getByRole("link", { name, exact: true });

test.describe("statistics", () => {
  test.beforeEach(async () => {
    await resetHousehold();
    await resetLibrary();
  });

  test("say what they still need where there is nothing to count", async ({ page }) => {
    await signIn(page);
    await page.getByRole("link", { name: "Statistik" }).click();
    await expect(page.getByRole("heading", { name: "Statistik", level: 1 })).toBeVisible();
    await expect(control(page, "Zeitraum", "Monat")).toHaveAttribute("aria-current", "page");
    await expect(card(page, "Am häufigsten gekocht")).toContainText(
      "Noch hat sich kein Gericht wiederholt.",
    );
    await expect(card(page, "Verlauf")).toContainText("Der Verlauf braucht");
    // No chart is drawn without data.
    await expect(page.locator(".column")).toHaveCount(0);

    await control(page, "Bereich", "Einkauf").click();
    await expect(card(page, "Einkaufskalender")).toContainText("noch nichts in der App abgehakt");
  });

  test("count the weeks planned and shopped, and lead to what they count", async ({ page }) => {
    await planHistory(6);
    await signIn(page);
    await page.goto("/woche/statistik?zeit=jahr");

    // The trend has a column per month, each a link to that month.
    const trend = card(page, "Verlauf");
    await expect(trend.locator(".column").first()).toBeVisible();
    await expect(card(page, "Ziele der Woche")).toContainText("pro Woche");
    await expect(card(page, "Ohne Rezept")).toContainText("Vesper");
    await expect(card(page, "Kaffee & Kuchen")).toContainText("Zitronen-Mohn-Kuchen");
    // What was new to the family, and the badges for trying something new.
    const found = card(page, "Entdeckt");
    await expect(found).toContainText("vom Kochbuch je gekocht");
    await expect(found.getByRole("list", { name: "Abzeichen" }).getByRole("listitem")).toHaveCount(
      5,
    );

    // A dish cooked more than once leads to its recipe, and the recipe back here.
    const top = card(page, "Am häufigsten gekocht");
    const first = top.getByRole("link").first();
    const title = (await first.locator(".truncate").first().textContent())!.trim();
    await first.click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await page
      .getByRole("link", { name: /Statistik/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/woche\/statistik/);

    // The shopping: errands, what was bought most, and who shopped.
    await page.goto("/woche/statistik?zeit=jahr&bereich=einkauf");
    await expect(card(page, "Am häufigsten gekauft")).toContainText("Milch");
    await expect(card(page, "Wo eingekauft wird")).toContainText("Markt");
    await expect(card(page, "Anders als geplant")).toContainText("Butter");
    await expect(card(page, "dm")).toContainText("Zahnpasta");
    await expect(card(page, "Wer kauft ein")).toBeVisible();

    // A week of it: a calendar of its days, the days shopped on links to their notes.
    await control(page, "Zeitraum", "Woche").click();
    await expect(page).toHaveURL(/zeit=woche/);
    await expect(page).toHaveURL(/bereich=einkauf/);
    const calendar = card(page, "Einkaufskalender");
    await calendar.locator("a.calendar-day").first().click();
    await expect(page).toHaveURL(/\/einkauf\?w=/);
  });

  test("screens @look", async ({ page }, info) => {
    await planHistory(6);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page);
    const shot = (name: string) =>
      page.screenshot({
        path: `test-results/look/${info.project.name}-7-${name}.png`,
        fullPage: true,
      });
    await page.goto("/woche/statistik");
    await page.waitForLoadState("networkidle");
    await shot("statistik-monat");
    await page.goto("/woche/statistik?zeit=jahr");
    await page.waitForLoadState("networkidle");
    await shot("statistik-jahr");
    await page.goto("/woche/statistik?bereich=einkauf");
    await page.waitForLoadState("networkidle");
    await shot("statistik-einkauf");
  });
});
