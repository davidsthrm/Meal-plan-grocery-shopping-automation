import { expect, test, type Page } from "@playwright/test";
import { planHistory, resetLibrary, signIn } from "./fixtures";

// The narrowest phone of the household's: 375 by 667 pixels, an iPhone SE. On it the week's
// arrows broke onto two rows, and the Rezept-Stapel's buttons lay under the bar of the
// sections (November 2026).
test.use({ viewport: { width: 375, height: 667 } });

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's screen");
  await resetLibrary();
  await signIn(page);
});

/** Where the strip of the sections at the foot of the screen begins, from the top. */
async function stripTop(page: Page): Promise<number> {
  const strip = await page.locator("nav.tabbar").boundingBox();
  expect(strip).not.toBeNull();
  return strip!.y;
}

test("the week's row of arrows is one line on every week, and the page ends above the strip", async ({
  page,
}) => {
  // The week the plan opens on, and a week that shows "Aktuelle" between the arrows.
  for (const week of ["", "?w=2027-03-01"]) {
    await page.goto(`/woche${week}`);
    const row = page.getByRole("navigation", { name: "Woche wechseln" });
    await expect(row.getByRole("link", { name: "Alle Wochen" })).toBeVisible();
    const box = await row.boundingBox();
    // One control is 44px tall: two rows would be twice that.
    expect(box!.height).toBeLessThan(60);
  }

  // At the end of the page nothing lies under the strip.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const main = await page.locator("main").boundingBox();
  expect(main!.y + main!.height).toBeLessThanOrEqual(await stripTop(page));
});

test("the Rezept-Stapel's three buttons stand above the strip as the page opens", async ({
  page,
}) => {
  await page.goto("/rezepte/stapel");
  const buttons = page.getByRole("group", { name: "Entscheiden" }).getByRole("button");
  await expect(buttons).toHaveCount(3);
  const top = await stripTop(page);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(top);
  }
});

test("the meal chooser names a long dish whole, on two lines at most", async ({ page }) => {
  await page.goto("/woche/auswahl?w=2027-03-01&ziel=extra&q=mohn");
  const name = page
    .getByRole("region", { name: "Ergebnisse" })
    .getByText("Zitronen-Mohn-Kuchen", { exact: true });
  await expect(name).toBeVisible();
  // Cut to one line, a dish was chosen by "Spinat-Cannell…" (audit, 24 November 2026).
  const cut = await name.evaluate(
    (element) =>
      element.scrollWidth > element.clientWidth + 1 ||
      element.scrollHeight > element.clientHeight + 1,
  );
  expect(cut).toBe(false);
});

test("the meal chooser keeps a dish's facts to one line, leaving out whole what does not fit", async ({
  page,
}) => {
  await page.goto("/woche/auswahl?w=2027-03-01&ziel=extra&q=e");
  const results = page.getByRole("region", { name: "Ergebnisse" });
  await expect(results.getByText("Kartoffelsuppe", { exact: true })).toBeVisible();
  // A fact shown on the line ends inside it: "4 Portion" was cut in the word.
  const cut = await results.locator(".dish-name").evaluateAll((names) =>
    names.flatMap((name) => {
      const line = name.parentElement!.nextElementSibling!;
      const box = line.getBoundingClientRect();
      return [...line.querySelectorAll("span")]
        .map((fact) => ({ text: fact.textContent, rect: fact.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.top < box.bottom - 1)
        .filter(({ rect }) => rect.right > box.right + 1)
        .map(({ text }) => `${name.textContent}: ${text}`);
    }),
  );
  expect(cut).toEqual([]);
});

test("the Rezept-Stapel's Zurück stands above the strip after a decision", async ({ page }) => {
  await page.goto("/rezepte/stapel");
  await page.getByRole("button", { name: "Nicht jetzt" }).click();
  // The only way to take a swipe back lay below the three buttons, under the strip on an
  // iPhone, with the count beside it. It stands above the card now.
  const back = page.getByRole("button", { name: "Zurück" });
  await expect(back).toBeVisible();
  const box = await back.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(await stripTop(page));
  const count = page.getByText(/· 0 vorgemerkt/);
  await expect(count).toBeVisible();
  const card = (await page.locator(".stack-deck").boundingBox())!.y;
  expect((await count.boundingBox())!.y).toBeLessThan(card);
  expect(box!.y + box!.height / 2).toBeLessThan(card);
});

test("a recipe cooked before says on the Regal when, the whole date", async ({ page }) => {
  await planHistory();
  await page.goto(`/rezepte/regal?buch=${encodeURIComponent("E2E Kochbuch")}`);
  const row = page.getByRole("region", { name: "Schon gekocht" }).getByRole("link").first();
  await expect(row).toContainText("Zuletzt am");
  // The date instead of the time: there is no room for both, and the date was cut off.
  await expect(row).not.toContainText("Min.");
  const date = row.getByText(/^Zuletzt am/);
  expect(await date.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
