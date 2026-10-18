import { expect, test, type Page } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-03-01";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

const meal = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const count = async (page: Page, group: string) => {
  const line = page
    .getByRole("list", { name: "Ausgewogenheit der Woche" })
    .getByRole("listitem")
    .filter({ hasText: group });
  return Number((await line.innerText()).match(/\d+/)?.[0]);
};

test("an empty week waits to be asked: a suggestion comes on request", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await expect(page.getByRole("heading", { name: "1.–7. März" })).toBeVisible();
  // Nothing is put on the plan unasked. A few meals offer a suggestion, to take or leave.
  await expect(page.getByText("Vorschlag", { exact: true })).toHaveCount(5);
  await expect(page.getByText("4 Personen")).toHaveCount(0);
  // Offered unasked, a suggestion says what it is for: nothing is planned, so a gap.
  await expect(page.getByText(/fehlt diese Woche noch/).first()).toBeVisible();

  // Asked for, whether it offered one already or not.
  const monday = meal(page, "Montag Mittag");
  await page.goto(`/woche?w=${WEEK}&frage=${WEEK}.lunch&v=0`);
  await expect(monday.getByText("Vorschlag", { exact: true })).toBeVisible();
  const first = await monday.getByRole("link").first().innerText();
  await monday.getByRole("link", { name: "Noch ein Vorschlag" }).click();
  await expect(monday.getByRole("link").first()).not.toHaveText(first);

  await monday.getByRole("button", { name: /einplanen/ }).click();
  await expect(monday).toContainText("4 Personen");
  await expect(monday.getByText("Vorschlag", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Plan vervollständigen" }).click();
  await expect(page.getByRole("link", { name: /Hast du einen Vorschlag/ })).toHaveCount(0);
  // Completed, the week meets what the household aims for.
  expect(await count(page, "Vegetarisch")).toBeGreaterThanOrEqual(3);
  expect(await count(page, "Fisch")).toBeGreaterThanOrEqual(1);
  expect(await count(page, "Fleisch")).toBeLessThanOrEqual(2);
  expect(await count(page, "Geflügel")).toBeLessThanOrEqual(2);
});

test("on a workday nothing is suggested that takes long", async ({ page }) => {
  // The goulash has no printed time and is tagged as taking long; the lasagne as well.
  await page.goto(`/woche/auswahl?w=${WEEK}&d=2027-03-03&m=dinner&modus=replace`);
  const workday = page.getByRole("region", { name: "Vorschläge" });
  await expect(workday.getByRole("listitem").first()).toBeVisible();
  await expect(workday).not.toContainText("Rindergulasch");
  await expect(workday).not.toContainText("Gemüse-Lasagne");
  // In the evening only what is quick or cold.
  await expect(workday).not.toContainText("Käsespätzle");

  await page.goto(`/woche/auswahl?w=${WEEK}&d=2027-03-06&m=lunch&modus=replace`);
  const saturday = page.getByRole("region", { name: "Vorschläge" });
  // The lasagne is a favourite: on a Saturday it leads the list.
  await expect(saturday.getByRole("listitem").first()).toContainText("Gemüse-Lasagne");
});

test("what someone wants to cook is suggested first, until it is planned", async ({ page }) => {
  await page.goto("/rezepte?q=forelle");
  await page.getByRole("link", { name: /Forelle Müllerin/ }).click();
  await page.getByRole("button", { name: "Möchte ich kochen" }).click();
  await expect(page.getByRole("button", { name: "Steht auf der Wunschliste" })).toBeVisible();

  await page.goto(`/woche?w=${WEEK}`);
  const wishes = page.getByRole("region", { name: "Möchte ich kochen" });
  await expect(wishes.getByRole("link", { name: "Forelle Müllerin einplanen" })).toBeVisible();
  const monday = meal(page, "Montag Mittag");
  await page.goto(`/woche?w=${WEEK}&frage=${WEEK}.lunch&v=0`);
  await expect(monday).toContainText("Forelle Müllerin");
  await expect(monday).toContainText("Möchtest du kochen");

  await monday.getByRole("button", { name: /einplanen/ }).click();
  await expect(monday).toContainText("4 Personen");
  // Planned, the wish is fulfilled.
  await expect(page.getByRole("region", { name: "Möchte ich kochen" })).toHaveCount(0);
});

test("a meal can be something without a recipe, and be emptied again", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await expect(page.getByRole("heading", { name: "Abendessen planen" })).toBeVisible();
  await page.getByRole("button", { name: "Vesper" }).click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("Vesper");

  await page.getByRole("link", { name: "Montag Abend ändern" }).click();
  await page.getByLabel("Eigener Eintrag").fill("bei Oma");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("bei Oma");
  await expect(meal(page, "Montag Abend")).not.toContainText("Vesper");

  await page.getByRole("button", { name: "Montag Abend leeren" }).click();
  await expect(page.getByRole("link", { name: "Montag Abend planen" })).toBeVisible();
  await expect(meal(page, "Montag Abend")).not.toContainText("bei Oma");
});

test("one meal after the other is planned without going back to the week", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Montag Mittag planen" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Noch nichts geplant");
  await page.getByPlaceholder("Titel oder Zutat").fill("pilz");
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("button", { name: "Pilzrisotto einplanen" })
    .click();
  // The page stays and says what the meal is now.
  await expect(page.getByRole("heading", { name: "Mittagessen planen" })).toBeVisible();
  await expect(page.getByText("Geplant: Pilzrisotto")).toBeVisible();

  await page.getByRole("link", { name: "Nächste Mahlzeit: Montag Abend" }).click();
  await expect(page.getByRole("heading", { name: "Abendessen planen" })).toBeVisible();
  await page.getByRole("button", { name: "Keiner daheim" }).click();
  await expect(page.getByText("Geplant: Keiner daheim")).toBeVisible();

  // Tuesday's lunch is planned already: the next open meal is its dinner.
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Dienstag Mittag planen" }).click();
  await page.getByRole("button", { name: "Reste" }).click();
  // Left before it is stored, the meal would still be open.
  await expect(page.getByText("Geplant: Reste")).toBeVisible();
  await page.goto(`/woche/auswahl?w=${WEEK}&d=2027-03-01&m=dinner&modus=replace`);
  await page.getByRole("link", { name: "Nächste Mahlzeit: Dienstag Abend" }).click();
  await expect(page.getByText("Dienstag, 2. März")).toBeVisible();

  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, "Montag Mittag")).toContainText("Pilzrisotto");
  await expect(meal(page, "Montag Abend")).toContainText("Keiner daheim");
});

test("a cake is planned as written, and a side dish can join a meal", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Dienstag Mittag planen" }).click();
  // The list under the search field answers while typing; a recipe is planned from it.
  await page.getByPlaceholder("Titel oder Zutat").fill("kuch");
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("button", { name: "Zitronen-Mohn-Kuchen einplanen" })
    .click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();

  // One cake tin, not four of them for four persons.
  const tuesday = meal(page, "Dienstag Mittag");
  await expect(tuesday).toContainText("1 Springform (Ø 26 cm)");
  await page.getByRole("button", { name: "Mehr von Zitronen-Mohn-Kuchen" }).click();
  await expect(tuesday).toContainText("2 Springform (Ø 26 cm)");

  await page.getByRole("link", { name: "Dienstag Mittag: etwas dazu" }).click();
  await expect(page.getByRole("heading", { name: "Zum Mittagessen dazu" })).toBeVisible();
  await page.getByRole("link", { name: "Vegan", exact: true }).click();
  await page.getByRole("button", { name: "Tomatensalat einplanen" }).click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(tuesday).toContainText("Zitronen-Mohn-Kuchen");
  await expect(tuesday).toContainText("Tomatensalat");
  await expect(tuesday).toContainText("4 Personen");
});

test("a recipe found while browsing is put on the plan from its own page", async ({ page }) => {
  await page.goto("/rezepte");
  // "Rindersteak" is in no title: the search also looks at the ingredients.
  await page.getByPlaceholder("Titel oder Zutat").fill("Rindersteak");
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await page.getByRole("link", { name: /Pfeffersteak/ }).click();
  await page.getByRole("link", { name: "Einplanen" }).click();

  await expect(page.getByText("einplanen: Mahlzeit wählen.")).toBeVisible();
  await page.getByRole("button", { name: "Sonntag Abend: hier einplanen" }).click();
  await expect(meal(page, "Sonntag Abend")).toContainText("Pfeffersteak");
  await expect(page.getByText("einplanen: Mahlzeit wählen.")).toHaveCount(0);

  // Back on its page, the recipe says it is planned, and leads to its meal.
  await page.goto("/rezepte?q=Pfeffersteak");
  await page.getByRole("link", { name: /Pfeffersteak/ }).click();
  await expect(page.getByRole("link", { name: "Einplanen" })).toHaveCount(0);
  // Planned for a day still to come is not cooked yet.
  await expect(page.getByText("Noch nie gekocht")).toBeVisible();
  await page.getByRole("link", { name: "Eingeplant" }).click();
  await expect(meal(page, "Sonntag Abend")).toContainText("Pfeffersteak");
});

test("all weeks are listed month by month and lead back to their plan", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await page.getByRole("button", { name: "Vesper" }).click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("Vesper");

  // The week is far ahead of today; the list reaches eight weeks ahead and back from there.
  await page.getByRole("link", { name: "Alle Wochen" }).click();
  await expect(page.getByRole("heading", { name: "Alle Wochen" })).toBeVisible();
  await expect(
    page.getByText("Diese Woche").or(page.getByText("Nächste Woche")).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(page.getByRole("heading", { name: "1.–7. März" })).toBeVisible();
});
