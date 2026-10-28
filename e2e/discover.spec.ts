import { expect, test } from "@playwright/test";
import { openFilters, resetLibrary, signIn } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

test("the library has a recipe of the day, themes and shelves to browse", async ({ page }) => {
  await page.goto("/rezepte");
  await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
  await expect(page.getByText("20 Rezepte im Kochbuch")).toBeVisible();
  // Favourites and wishes have a page of their own, and recipes are added under Import.
  await expect(page.getByRole("region", { name: "Favoriten", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Möchte ich kochen" })).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Filter" }).getByRole("link", { name: "Favoriten" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Rezept hinzufügen" })).toHaveCount(0);

  // A recipe of the day to plan at once, and a theme says what is behind it and how many.
  await expect(
    page.getByRole("region", { name: "Heute entdecken" }).getByRole("link", { name: "Einplanen" }),
  ).toBeVisible();
  const evening = page
    .getByRole("region", { name: "Worauf habt ihr Lust?" })
    .getByRole("link", { name: /Feierabendküche/ });
  await expect(evening).toContainText("Hauptgerichte in höchstens 30 Minuten");
  const count = (await evening.textContent())!.match(/(\d+)\s*$/)![1];
  await evening.click();
  await expect(page.getByRole("status")).toHaveText(`${count} Rezepte passen dazu`);
  await expect(page).toHaveURL(/kategorie=hauptgericht/);

  // The favourite Gemüse-Lasagne is on "Favoriten", not here: only words typed find it.
  await page.goto("/rezepte?kategorie=hauptgericht");
  await expect(page.getByRole("status")).toHaveText("14 Rezepte passen dazu");
  await expect(page.getByRole("link", { name: /Gemüse-Lasagne/ })).toHaveCount(0);

  // The filters say how many recipes each choice leaves, and stay open while choosing.
  const close = await openFilters(page);
  const panel = page.getByLabel("Filter", { exact: true });
  await panel.getByRole("link", { name: /^Fisch 2$/ }).click();
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");
  await panel.getByRole("link", { name: /^bis 20 Min\. 1$/ }).click();
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await close();
  await expect(page.getByRole("link", { name: /Lachs mit Currysahne/ })).toBeVisible();

  // What is on stands above the list, each to take away with a tap.
  const active = page.getByRole("group", { name: "Aktive Filter" });
  await active.getByRole("link", { name: "bis 20 Min. entfernen" }).click();
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");
  await active.getByRole("link", { name: "Alle entfernen" }).click();
  await expect(page.getByRole("region", { name: "Heute entdecken" })).toBeVisible();

  // Nothing left: each filter that is on, left out, shows how many recipes come back.
  await page.goto("/rezepte?kost=fisch&kategorie=salat");
  await expect(page.getByRole("status")).toHaveText("Kein Rezept passt dazu.");
  await page.getByRole("link", { name: /^Ohne „Salat“: 2 Rezepte$/ }).click();
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");

  // A tag narrows the library down like everything else, and two tags mean both.
  await page.goto("/rezepte?tag=herbst");
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");
  const closeAgain = await openFilters(page);
  // Groups beyond the first few open with a tap on their name.
  const filters = page.getByLabel("Filter", { exact: true });
  await filters.getByText("Gericht", { exact: true }).click();
  await filters.getByRole("link", { name: /^Reis & Getreide/ }).click();
  await closeAgain();
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await expect(page.getByRole("link", { name: /Pilzrisotto/ })).toBeVisible();
});

test("the list under the search field changes with every letter", async ({ page }) => {
  await page.goto("/rezepte");
  const field = page.getByPlaceholder("Titel oder Zutat");
  const hits = page.getByRole("region", { name: "Treffer beim Tippen" });
  await field.pressSequentially("l");
  await expect(hits.getByRole("listitem").first()).toBeVisible();
  await expect(hits).toContainText("Lachs mit Currysahne");
  await expect(hits).toContainText("Linsen-Eintopf");

  await field.pressSequentially("ac");
  await expect(hits).toContainText("Lachs mit Currysahne");
  await expect(hits).not.toContainText("Linsen-Eintopf");

  // An ingredient is found as well, and a result opens its recipe.
  await field.fill("rindersteak");
  await hits.getByRole("link", { name: /Pfeffersteak/ }).click();
  await expect(page.getByRole("heading", { name: "Pfeffersteak" })).toBeVisible();
});

test("the search finds a title however it is spelled", async ({ page }) => {
  await page.goto("/rezepte");
  await page.getByPlaceholder("Titel oder Zutat").fill("kurbis");
  await page.getByPlaceholder("Titel oder Zutat").press("Enter");
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await expect(page.getByRole("link", { name: /Kürbisgnocchi/ })).toBeVisible();

  // A typing mistake still leads to the recipe.
  await page.getByPlaceholder("Titel oder Zutat").fill("lasange");
  await page.getByPlaceholder("Titel oder Zutat").press("Enter");
  await expect(page.getByRole("link", { name: /Gemüse-Lasagne/ })).toBeVisible();

  // Two words: what has both is a result, what has one of them is offered as related.
  await page.getByPlaceholder("Titel oder Zutat").fill("lachs suppe");
  await page.getByPlaceholder("Titel oder Zutat").press("Enter");
  await expect(page.getByRole("status")).toHaveText("Kein Rezept passt dazu.");
  await expect(page.getByRole("region", { name: "Ähnliche Rezepte" })).toContainText(
    "Lachs mit Currysahne",
  );

  await page.getByPlaceholder("Titel oder Zutat").fill("xyz gibt es nicht");
  await page.getByPlaceholder("Titel oder Zutat").press("Enter");
  await expect(page.getByRole("status")).toHaveText("Kein Rezept passt dazu.");
});

test("a favourite is one tap and has a page of its own", async ({ page }) => {
  await page.goto("/rezepte?q=Pfeffersteak");
  await page.getByRole("link", { name: /Pfeffersteak/ }).click();
  const heart = page.getByRole("button", { name: "Favorit: Pfeffersteak" });
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  // An old link to the favourites under "Entdecken" leads to their page.
  await page.goto("/rezepte?favoriten=1");
  await expect(page).toHaveURL(/\/favoriten/);
  await page.goto("/rezepte");

  // The favourites have a page of their own, sorted by what they are.
  await page
    .getByRole("navigation", { name: "Hauptbereiche" })
    .getByRole("link", { name: "Favoriten" })
    .click();
  await expect(page.getByRole("heading", { name: "Favoriten", level: 1 })).toBeVisible();
  await expect(page.getByText("2 Favoriten", { exact: true })).toBeVisible();
  const mains = page.getByRole("region", { name: "Hauptgericht" });
  await expect(mains).toContainText("Gemüse-Lasagne");
  await expect(mains).toContainText("Pfeffersteak");
  // The search there looks through the favourites only.
  await page.getByPlaceholder("Titel oder Zutat").fill("lachs");
  await page.getByPlaceholder("Titel oder Zutat").press("Enter");
  await expect(page.getByRole("status")).toHaveText("Kein Favorit passt dazu.");
});

test("the heart on a card makes a recipe a favourite without opening it", async ({ page }) => {
  await page.goto("/rezepte?q=Pfeffersteak");
  const heart = page.getByRole("button", { name: "Favorit: Pfeffersteak" });
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/rezepte\?q=Pfeffersteak/);

  await page.goto("/favoriten");
  const mains = page.getByRole("region", { name: "Hauptgericht" });
  await expect(mains).toContainText("Pfeffersteak");
  // Tapped again, it is no favourite any more.
  await page.getByRole("button", { name: "Favorit: Pfeffersteak" }).click();
  await expect(mains).not.toContainText("Pfeffersteak");
});

test("the cookbook page is folded away and shows the recipe's own part", async ({ page }) => {
  await page.goto("/rezepte?q=lasagne");
  await page.getByRole("link", { name: /Gemüse-Lasagne/ }).click();
  await expect(page.getByRole("heading", { name: "Zutaten" })).toBeVisible();
  const photo = page.getByAltText("Seite 1 von Gemüse-Lasagne");
  await expect(photo).toBeHidden();

  await page.getByText("Originalfoto").click();
  await expect(photo).toBeVisible();
  // What opens is the part cut out for this recipe, and it really loads.
  await expect(photo).toHaveAttribute("src", /crops\/lasagne\.jpg/);
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "Ganze Seite ansehen" })).toHaveAttribute(
    "href",
    /pages\/0001\.jpg/,
  );

  // A recipe without a part of its own shows the page.
  await page.goto("/rezepte?q=spätzle");
  await page.getByRole("link", { name: /Käsespätzle/ }).click();
  await page.getByText("Originalfoto").click();
  await expect(page.getByAltText("Seite 1 von Käsespätzle")).toHaveAttribute(
    "src",
    /pages\/0001\.jpg/,
  );
  await expect(page.getByRole("link", { name: "In voller Größe ansehen" })).toBeVisible();
});

test("the stepper scales the ingredients, the amounts in the steps and the cooking view", async ({
  page,
}) => {
  await page.goto("/rezepte?q=kartoffelsuppe");
  await page.getByRole("link", { name: /Kartoffelsuppe/ }).click();
  const amount = page.getByRole("group", { name: "Menge" });
  const ingredients = page.getByRole("region", { name: "Zutaten" });
  const steps = page.locator("#arbeitsschritte");
  await expect(amount).toContainText("4 Personen");
  await expect(ingredients).toContainText("1 kg");

  await amount.getByRole("button", { name: "Mehr" }).click();
  await amount.getByRole("button", { name: "Mehr" }).click();
  await expect(amount).toContainText("6 Personen");
  await expect(ingredients).toContainText("1,5 kg");
  await expect(ingredients).toContainText("150 ml");
  await page.getByText("Arbeitsschritte · 3").click();
  await expect(steps).toContainText("3 Karotten und die Kartoffeln");
  await expect(steps).toContainText("150 ml Sahne");
  // A time is no amount.
  await expect(steps).toContainText("20 Minuten weich kochen");
  await expect(steps).toContainText("Mengen für 6 Personen");

  // The steps as printed, one tap away.
  await steps.getByRole("button", { name: "Wie gedruckt zeigen" }).click();
  await expect(steps).toContainText("2 Karotten und die Kartoffeln");
  await expect(steps).toContainText("100 ml Sahne");
  await steps.getByRole("button", { name: "Umgerechnet zeigen" }).click();
  await expect(steps).toContainText("150 ml Sahne");

  // The number is kept in the address: a reload finds it again.
  await expect(page).toHaveURL(/portionen=6/);
  await page.reload();
  await expect(amount).toContainText("6 Personen");

  await page.getByRole("link", { name: "Kochen" }).click();
  const cooking = page.getByRole("dialog", { name: "Kochen: Kartoffelsuppe" });
  await expect(cooking).toContainText("6 Personen");
  await expect(cooking).toContainText("150 ml");
  await expect(cooking).toContainText("3 Karotten");
});

test("the Arbeitsschritte are folded away, and a recipe without any says so", async ({ page }) => {
  await page.goto("/rezepte?q=risotto");
  await page.getByRole("link", { name: /Pilzrisotto/ }).click();
  const first = page.getByText("Pilze putzen und in Scheiben schneiden.");
  await expect(first).toBeHidden();
  await page.getByText("Arbeitsschritte · 3").click();
  await expect(first).toBeVisible();

  await page.goto("/rezepte?q=spätzle");
  await page.getByRole("link", { name: /Käsespätzle/ }).click();
  await expect(page.getByText("Keine Arbeitsschritte vorhanden.")).toBeVisible();
});

test("steps read with a doubt are checked against the photo and taken over", async ({ page }) => {
  await page.goto("/import");
  await page.getByRole("link", { name: /1 Rezept mit unsicheren Arbeitsschritten/ }).click();
  await expect(page.getByRole("heading", { name: "Arbeitsschritte prüfen" })).toBeVisible();
  await expect(page.getByText("Schritt 2: Die Garzeit ist verwischt.")).toBeVisible();

  const steps = page.getByLabel("Arbeitsschritte, einer pro Zeile");
  await steps.fill("Linsen waschen.\nEtwa 30 Minuten köcheln lassen.");
  await page.getByRole("button", { name: "Stimmt so, übernehmen" }).click();
  await expect(page.getByText("Alle Arbeitsschritte sind geprüft.")).toBeVisible();

  await page.goto("/rezepte?q=linsen");
  await page.getByRole("link", { name: /Linsen-Eintopf/ }).click();
  await expect(page.getByText("nicht ganz sicher gelesen")).toHaveCount(0);
  await page.getByText("Arbeitsschritte · 2").click();
  await expect(page.getByText("Etwa 30 Minuten köcheln lassen.")).toBeVisible();
});

test("the Arbeitsschritte are changed on the recipe's page, and emptied mean none", async ({
  page,
}) => {
  await page.goto("/rezepte?q=risotto");
  await page.getByRole("link", { name: /Pilzrisotto/ }).click();
  await page.getByText("Arbeitsschritte · 3").click();
  await page.getByRole("link", { name: "Arbeitsschritte ändern" }).click();
  const field = page.getByLabel("Arbeitsschritte, einer pro Zeile");
  await expect(field).toHaveValue(/^Pilze putzen/);
  await field.fill("Pilze putzen.\nReis rühren.");
  await page.getByRole("button", { name: "Speichern" }).click();
  // Saved, the steps stand open as they are now.
  await expect(page.getByText("Reis rühren.")).toBeVisible();
  await expect(page.getByText("Arbeitsschritte · 2")).toBeVisible();
  // The way back still leads where the recipe was opened from.
  await expect(page.getByRole("link", { name: "← Entdecken" })).toBeVisible();

  await page.getByRole("link", { name: "Arbeitsschritte ändern" }).click();
  await page.getByLabel("Arbeitsschritte, einer pro Zeile").fill("");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Keine Arbeitsschritte vorhanden.")).toBeVisible();

  // A recipe without steps gets them where it says it has none.
  await page.getByRole("link", { name: "Eintragen" }).click();
  await page.getByLabel("Arbeitsschritte, einer pro Zeile").fill("Reis kochen.");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Reis kochen.")).toBeVisible();
});

test("steps that are not on the photo are put away with one tap", async ({ page }) => {
  await page.goto("/import/pruefen/schritte");
  await page.getByRole("button", { name: "Keine Arbeitsschritte" }).click();
  await expect(page.getByText("Alle Arbeitsschritte sind geprüft.")).toBeVisible();

  await page.goto("/rezepte?q=linsen");
  await page.getByRole("link", { name: /Linsen-Eintopf/ }).click();
  await expect(page.getByText("Keine Arbeitsschritte vorhanden.")).toBeVisible();
});

test("the season page shows what is harvested and the recipes made with it", async ({ page }) => {
  await page.goto("/rezepte");
  await page.getByRole("link", { name: /Saison im / }).click();
  await expect(page.getByRole("heading", { name: "Was hat gerade Saison?" })).toBeVisible();
  // A month ahead is one tap away, and the way back too.
  const months = page.getByRole("navigation", { name: "Monat" });
  await months.getByRole("link").last().click();
  await expect(page.getByRole("heading", { name: /^Saison im / })).toBeVisible();
  await page.getByRole("link", { name: /^Zurück zum / }).click();
  await expect(page.getByRole("heading", { name: "Was hat gerade Saison?" })).toBeVisible();

  // In a month with pumpkins, the made-up Kürbisgnocchi are made with them.
  await page.goto("/rezepte/saison?monat=10&zutat=kuerbis");
  const pumpkin = page.getByRole("region", { name: "Rezepte mit Kürbis" });
  await expect(pumpkin.getByRole("link", { name: /Kürbisgnocchi/ })).toBeVisible();
});

test("a phone held across asks to be turned upright", async ({ page, isMobile }) => {
  test.skip(!isMobile, "only a phone");
  await page.goto("/rezepte");
  await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByText("Bitte das Handy hochkant halten.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entdecken" })).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
});

test("the Regal is a shelf of cookbooks, and a recipe leads back to the open book", async ({
  page,
}) => {
  await page.goto("/rezepte");
  await page
    .getByRole("navigation", { name: "Ansicht" })
    .getByRole("link", { name: "Regal" })
    .click();
  const shelf = page.getByRole("navigation", { name: "Kochbücher und Hefte" });
  await shelf.getByRole("link", { name: /^Zweites Buch, 0 von 9 gekocht$/ }).click();
  await expect(page).toHaveURL(/\/rezepte\/regal\?buch=Zweites\+Buch$/);
  const book = page.getByRole("region", { name: "Zweites Buch" });
  await expect(book).toContainText("0 von 9 gekocht");
  await book
    .getByRole("region", { name: "Noch nie gekocht" })
    .getByRole("link", { name: /Forelle Müllerin/ })
    .click();
  await expect(page.getByRole("heading", { name: "Forelle Müllerin" })).toBeVisible();
  await page.getByRole("link", { name: "← Regal" }).click();
  await expect(page).toHaveURL(/\/rezepte\/regal\?buch=Zweites\+Buch$/);
  await expect(page.getByRole("heading", { name: "Zweites Buch" })).toBeVisible();
});

test("a category is a tab of its own, and its recipes lead back to it", async ({ page }) => {
  await page.goto("/rezepte");
  const tabs = page.getByRole("navigation", { name: "Kategorien" });
  await expect(tabs.getByRole("link", { name: "Für euch" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "Hauptgericht" }).click();
  await expect(page).toHaveURL(/\/rezepte\?art=hauptgericht$/);
  await expect(tabs.getByRole("link", { name: "Hauptgericht" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Only Für euch has the row of what there is to do besides browsing.
  await expect(page.getByRole("navigation", { name: "Mehr entdecken" })).toHaveCount(0);
  const day = page.getByRole("region", { name: "Heute entdecken" });
  const title = (await day.getByRole("heading").textContent())!;
  await day.getByRole("heading").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await page.getByRole("link", { name: "← Entdecken" }).click();
  await expect(page).toHaveURL(/\/rezepte\?art=hauptgericht$/);
});

test("the recipe stack keeps a recipe as a wish, and Zurück takes it back", async ({ page }) => {
  await page.goto("/rezepte");
  await page
    .getByRole("navigation", { name: "Mehr entdecken" })
    .getByRole("link", { name: /Rezept-Stapel/ })
    .click();
  await expect(page.getByRole("heading", { name: "Rezept-Stapel" })).toBeVisible();
  const card = page.locator('.stack-card[data-depth="0"]');
  const first = (await card.getByRole("heading").textContent())!;
  await page.getByRole("button", { name: "Vormerken" }).click();
  await expect(page.getByText(/· 1 vorgemerkt/)).toBeVisible();
  await expect(card.getByRole("heading")).not.toHaveText(first);

  // Taken back: the card is on top again and no wish is left.
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(card.getByRole("heading")).toHaveText(first);
  await expect(page.getByText(/· 0 vorgemerkt/)).toBeVisible();

  // Kept for good: it is a wish on Favoriten and out of the stack when it is dealt anew.
  await page.getByRole("button", { name: "Vormerken" }).click();
  await expect(page.getByText(/· 1 vorgemerkt/)).toBeVisible();
  await page.waitForTimeout(500);
  await page.goto("/favoriten");
  await expect(page.getByRole("link", { name: new RegExp(first) }).first()).toBeVisible();
  await page.goto("/rezepte/stapel");
  await expect(card.getByRole("heading")).not.toHaveText(first);

  // Put aside: it stays out of the stack.
  const second = (await card.getByRole("heading").textContent())!;
  await page.getByRole("button", { name: "Nicht jetzt" }).click();
  await expect(card.getByRole("heading")).not.toHaveText(second);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator(".stack-card h2", { hasText: second })).toHaveCount(0);
});

test("Was ist noch da? lists recipes for what is left, and the way back keeps it", async ({
  page,
}) => {
  await page.goto("/rezepte/zutaten");
  const field = page.getByLabel("Zutat suchen");
  await field.fill("kartof");
  await field.press("Enter");
  await field.fill("karott");
  await field.press("Enter");
  const there = page.getByRole("group", { name: "Ist noch da" });
  await expect(there.getByRole("button", { name: "Kartoffeln entfernen" })).toBeVisible();
  await expect(there.getByRole("button", { name: "Karotten entfernen" })).toBeVisible();
  const soup = page.getByRole("link", { name: /Kartoffelsuppe/ });
  await expect(soup).toContainText("2 von");
  await soup.click();
  await expect(page.getByRole("heading", { name: "Kartoffelsuppe" })).toBeVisible();
  await page.getByRole("link", { name: "← Was ist noch da?" }).click();
  await expect(page).toHaveURL(/z=Kartoffeln&z=Karotten/);
  await expect(there.getByRole("button", { name: "Karotten entfernen" })).toBeVisible();
});

test("the roulette says what it needs when no recipe has a main ingredient and a cuisine", async ({
  page,
}) => {
  await page.goto("/rezepte/roulette");
  await expect(page.getByRole("heading", { name: "Rezept-Roulette" })).toBeVisible();
  await expect(
    page.getByText(
      "Für das Roulette brauchen die Rezepte Stichworte zu Hauptzutat, Küche und Aufwand.",
    ),
  ).toBeVisible();
});
