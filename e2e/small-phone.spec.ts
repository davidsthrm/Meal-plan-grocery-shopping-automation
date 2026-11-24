import { expect, test, type Page } from "@playwright/test";
import { planAsExtra, planHistory, resetLibrary, signIn } from "./fixtures";

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

test("the week's row of arrows is one line on every week, and the page ends above the strip @webkit", async ({
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

test("the Rezept-Stapel's three buttons stand above the strip as the page opens @webkit", async ({
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

test("the meal chooser names a long dish whole, on two lines at most @webkit", async ({ page }) => {
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

test("the meal chooser keeps a dish's facts to one line, leaving out whole what does not fit @webkit", async ({
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

test("the Rezept-Stapel's Zurück stands above the strip after a decision @webkit", async ({
  page,
}) => {
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
  // All of it: its foot lay over the card, and a tap there opened the recipe.
  expect(box!.y + box!.height).toBeLessThanOrEqual(card);
});

test("a recipe cooked before says on the Regal when, the whole date @webkit", async ({ page }) => {
  await planHistory();
  await page.goto(`/rezepte/regal?buch=${encodeURIComponent("E2E Kochbuch")}`);
  const row = page.getByRole("region", { name: "Schon gekocht" }).getByRole("link").first();
  await expect(row).toContainText("Zuletzt am");
  // The date instead of the time: there is no room for both, and the date was cut off.
  await expect(row).not.toContainText("Min.");
  const date = row.getByText(/^Zuletzt am/);
  expect(await date.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("a title in Alle Rezepte is as tall as a finger @webkit", async ({ page }) => {
  await page.goto("/import/rezepte");
  // It was 19px tall, right above the line that folds the row open.
  const title = page.getByRole("link", { name: "Kartoffelsuppe", exact: true });
  expect((await title.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("the recipe form's Speichern is a bar standing on the strip @webkit", async ({ page }) => {
  await page.goto("/rezepte?q=kartoffelsuppe");
  await page.getByRole("link", { name: /Kartoffelsuppe/ }).click();
  await page.getByRole("link", { name: "Rezept ändern" }).click();
  await expect(page.getByRole("heading", { name: "Rezept ändern" })).toBeVisible();
  // A pill floating over the fields: a tap meant for a field saved and left the form.
  const bar = page.locator(".save-bar");
  await expect(bar.getByRole("button", { name: "Speichern" })).toBeVisible();
  for (const y of [0, 600]) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    const box = await bar.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(374);
    expect(Math.abs(box!.y + box!.height - (await stripTop(page)))).toBeLessThan(1.5);
  }
  // At the end nothing lies under it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const steps = await page.getByLabel("Arbeitsschritte, einer pro Zeile").boundingBox();
  expect(steps!.y + steps!.height).toBeLessThanOrEqual((await bar.boundingBox())!.y);
});

/** Writes lines onto the week's first supermarket note, opened. */
async function writeOnNote(page: Page, ...lines: string[]) {
  await planAsExtra("Zitronen-Mohn-Kuchen", "2027-03-01");
  await page.goto("/einkauf?w=2027-03-01&zettel=2027-03-01.supermarket");
  const write = page.getByLabel("Auf den Zettel schreiben");
  for (const line of lines) {
    await write.fill(line);
    await write.press("Enter");
    await expect(page.locator("li.swipe-row").filter({ hasText: line })).toHaveCount(1);
  }
}

test("a long word on a note keeps the line's signs in their column @webkit", async ({ page }) => {
  await writeOnNote(page, "500 g Rinderhackfleisch", "Spülmaschinentabs");
  // The last sign of every line ends where the others do: a word wider than the text's
  // column pushed them out by up to 29px, and cut the shelf off (audit, 24 November 2026).
  const ends = await page
    .locator("li.tick-line .row-actions")
    .evaluateAll((signs) => signs.map((sign) => Math.round(sign.getBoundingClientRect().right)));
  expect(ends.length).toBeGreaterThan(2);
  expect(new Set(ends).size).toBe(1);
  expect(ends[0]).toBeLessThanOrEqual(375);
});

test("a row's menu stays on the screen wherever the row is held @webkit", async ({ page }) => {
  await writeOnNote(page, "2x Bio-Heumilch 3,8% laktosefrei Berchtesgadener Land");
  const row = page.locator("li.swipe-row").filter({ hasText: "Bio-Heumilch" });
  const menu = page.getByRole("menu");
  // Held at several heights of the screen: the menu opened above a row near the middle ran
  // off the top, and the long name made it wider than the screen.
  for (const top of [90, 250, 290, 330, 420, 560]) {
    await row.evaluate((element, y) => {
      window.scrollBy(0, element.getBoundingClientRect().top - y);
    }, top);
    await row.click({ button: "right", position: { x: 60, y: 20 } });
    await expect(menu).toBeVisible();
    // It grows out of the row: measured once it has.
    await page.waitForTimeout(250);
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }
});
