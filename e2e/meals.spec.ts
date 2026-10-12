import { expect, test, type Page } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-03-01";

test.beforeEach(async () => {
  await resetLibrary();
});

const meal = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("the first visit on a device asks what a week should contain", async ({ page }) => {
  await signIn(page, "first");
  await expect(page.getByRole("heading", { name: "Ziele der Woche" })).toBeVisible();

  // What makes no sense is refused with a reason.
  await page.getByLabel("Fisch mindestens").fill("5");
  await page.getByLabel("Fisch höchstens").fill("2");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Das passt nicht zusammen")).toBeVisible();

  await page.getByLabel("Fisch mindestens").fill("2");
  await page.getByLabel("Fleisch höchstens").fill("1");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/woche$/);
  const balance = page.getByRole("list", { name: "Ausgewogenheit der Woche" });
  await expect(balance.getByRole("listitem").filter({ hasText: "Fisch" })).toContainText("mind. 2");
  await expect(balance.getByRole("listitem").filter({ hasText: "Fleisch" })).toContainText(
    "höchstens 1",
  );

  // Asked once: the plan opens directly from now on, and the goals stay reachable.
  await page.goto("/woche");
  await expect(page).toHaveURL(/\/woche$/);
  await page.getByRole("link", { name: "Ziele ändern" }).click();
  await expect(page.getByLabel("Fisch mindestens")).toHaveValue("2");
});

test("the goals can be left as they are", async ({ page }) => {
  await signIn(page, "first");
  await page.getByRole("button", { name: "So lassen" }).click();
  await expect(page).toHaveURL(/\/woche$/);
  await expect(
    page.getByRole("list", { name: "Ausgewogenheit der Woche" }).getByRole("listitem").first(),
  ).toContainText("mind. 3");
  await page.goto("/woche");
  await expect(page).toHaveURL(/\/woche$/);
});

test("Sunday has a place for coffee and cake", async ({ page }) => {
  await signIn(page);
  await page.goto(`/woche?w=${WEEK}`);
  await expect(meal(page, "Samstag Kaffee & Kuchen")).toHaveCount(0);
  // Optional: nothing is suggested there, and the other meals never get a cake.
  await expect(meal(page, "Sonntag Kaffee & Kuchen")).not.toContainText("Vorschlag");
  await expect(page.getByText("Zitronen-Mohn-Kuchen")).toHaveCount(0);

  await page.getByRole("link", { name: "Sonntag Kaffee & Kuchen planen" }).click();
  await expect(page.getByRole("heading", { name: "Kaffee & Kuchen planen" })).toBeVisible();
  await page
    .getByRole("region", { name: "Vorschläge" })
    .getByRole("button", { name: "Zitronen-Mohn-Kuchen einplanen" })
    .click();
  await expect(meal(page, "Sonntag Kaffee & Kuchen")).toContainText("1 Springform (Ø 26 cm)");
});

test("a week can need recipes that belong to none of its meals", async ({ page }) => {
  await signIn(page);
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Außerdem" }).click();
  await page.getByRole("link", { name: "Rezept hinzufügen" }).click();
  await expect(page.getByRole("heading", { name: "Außerdem einplanen" })).toBeVisible();
  await page.getByPlaceholder("Titel oder Zutat").fill("kuchen");
  await page.getByRole("button", { name: "Suchen" }).click();
  await page.getByRole("button", { name: "Zitronen-Mohn-Kuchen einplanen" }).click();

  const extras = page.getByRole("region", { name: "Außerdem" });
  await expect(extras).toContainText("1 Springform (Ø 26 cm)");
  await page.getByRole("button", { name: "Mehr von Zitronen-Mohn-Kuchen" }).click();
  await expect(extras).toContainText("2 Springform (Ø 26 cm)");
  await page.getByLabel("Wofür ist Zitronen-Mohn-Kuchen?").fill("Einladung am Samstag");
  await page.getByRole("button", { name: "Merken" }).click();
  await expect(page.getByLabel("Wofür ist Zitronen-Mohn-Kuchen?")).toHaveValue(
    "Einladung am Samstag",
  );
  await expect(page.getByRole("link", { name: "Außerdem (1)" })).toBeVisible();

  // The meals of the week are untouched by it.
  await page.getByRole("link", { name: "Mahlzeiten" }).click();
  await expect(page.getByText("Vorschlag", { exact: true })).toHaveCount(14);
});

test("a cold supper gets the things to buy for it", async ({ page }) => {
  await signIn(page);
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await page.getByRole("button", { name: "Vesper" }).click();
  await page.getByRole("link", { name: "Montag Abend: Lebensmittel" }).click();
  await expect(page.getByRole("heading", { name: "Lebensmittel für Vesper" })).toBeVisible();

  // One tap, and bread for a cold supper comes from the bakery.
  await page.getByRole("button", { name: "Brot hinzufügen" }).click();
  const chosen = page.getByRole("region", { name: "Ausgewählt" });
  await expect(chosen).toContainText("Brot · Bäcker");
  await expect(page.getByRole("button", { name: "Brot hinzufügen" })).toHaveCount(0);

  await page.getByLabel("Anderes Lebensmittel").fill("Obatzter");
  await page.getByLabel("Wo wird es gekauft?").selectOption("Metzger");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(chosen).toContainText("Obatzter · Metzger");
  await page.getByRole("button", { name: "Gurke hinzufügen" }).click();
  await page.getByRole("button", { name: "Obatzter entfernen" }).click();
  await expect(chosen).not.toContainText("Obatzter");

  await page.getByRole("link", { name: "Fertig" }).click();
  await expect(meal(page, "Montag Abend")).toContainText("Brot, Gurke");
});

test("a typed meal becomes its recipe, or a new recipe typed in by hand", async ({ page }) => {
  await signIn(page);
  await page.goto(`/woche?w=${WEEK}`);

  // The library has this one: typing its name plans the recipe.
  await page.getByRole("link", { name: "Dienstag Abend planen" }).click();
  await page.getByLabel("Eigener Eintrag").fill("pilzrisotto");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(
    meal(page, "Dienstag Abend").getByRole("link", { name: "Pilzrisotto" }),
  ).toBeVisible();
  await expect(meal(page, "Dienstag Abend")).toContainText("4 Personen");

  // This one it does not have: it stays as typed, and can be made a recipe from there.
  await page.getByRole("link", { name: "Mittwoch Abend planen" }).click();
  await page.getByLabel("Eigener Eintrag").fill("Pestonudeln");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(meal(page, "Mittwoch Abend")).toContainText("Pestonudeln");
  await page.getByRole("link", { name: "Mittwoch Abend: Rezept anlegen" }).click();

  await expect(page.getByRole("heading", { name: "Neues Rezept" })).toBeVisible();
  await expect(page.getByLabel("Titel")).toHaveValue("Pestonudeln");
  // Without ingredients it is no recipe.
  await page.getByRole("button", { name: "Speichern und einplanen" }).click();
  await expect(page.getByText("Mindestens eine Zutat, eine pro Zeile.")).toBeVisible();
  await expect(page.getByLabel("Titel")).toHaveValue("Pestonudeln");

  await page.getByLabel("Art").selectOption("Hauptgericht");
  await page.getByLabel("Zählt in der Woche als").selectOption("Vegetarisch");
  await page.getByLabel("Minuten").fill("15");
  await page.getByLabel("Zutaten, eine pro Zeile").fill("500 g Spaghetti\n1 Glas Pesto\nParmesan");
  await page.getByRole("button", { name: "Speichern und einplanen" }).click();

  const wednesday = meal(page, "Mittwoch Abend");
  await expect(wednesday.getByRole("link", { name: "Pestonudeln" })).toBeVisible();
  await expect(wednesday).toContainText("4 Personen");
  await wednesday.getByRole("link", { name: "Pestonudeln" }).click();
  await expect(page.getByRole("heading", { name: "Pestonudeln" })).toBeVisible();
  await expect(page.getByText("500 g")).toBeVisible();
  await expect(page.getByText("Spaghetti")).toBeVisible();
  await expect(page.getByText("15 Min.")).toBeVisible();
});

test("a recipe can be corrected by hand", async ({ page }) => {
  await signIn(page);
  await page.goto("/rezepte?q=mohn");
  await page.getByRole("link", { name: /Zitronen-Mohn-Kuchen/ }).click();
  await page.getByRole("link", { name: "Ändern" }).click();
  await expect(page.getByRole("heading", { name: "Rezept ändern" })).toBeVisible();

  await page.getByLabel("Reicht für").fill("2");
  await page.getByLabel("statt Personen").fill("Kastenform");
  await page.getByLabel("Art").selectOption("Dessert & Süßspeise");
  // The recipe was typed, so its ingredients can be typed again.
  await page.getByLabel("Zutaten, eine pro Zeile").fill("250 g Mehl\n3 Eier");
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.getByRole("heading", { name: "Zitronen-Mohn-Kuchen" })).toBeVisible();
  await expect(page.getByText("2 Kastenform")).toBeVisible();
  await expect(page.getByText("Dessert & Süßspeise")).toBeVisible();
  await expect(page.getByText("250 g")).toBeVisible();
});
