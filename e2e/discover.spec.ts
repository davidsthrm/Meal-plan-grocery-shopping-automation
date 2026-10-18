import { expect, test } from "@playwright/test";
import { resetLibrary, signIn } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

test("the library has a few shelves and a directory to narrow it down", async ({ page }) => {
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

  // The directory says how many recipes are behind each way to narrow the library down.
  const browse = page.getByRole("region", { name: "Stöbern" });
  await expect(browse.getByRole("region", { name: "Kochbuch" })).toContainText("Zweites Buch");
  await expect(browse.getByRole("region", { name: "Aufwand" })).toContainText("Braucht Zeit");
  await browse
    .getByRole("region", { name: "Art", exact: true })
    .getByRole("link", { name: /Hauptgericht/ })
    .click();
  await expect(page.getByRole("status")).toHaveText("15 Rezepte passen dazu");

  await page.getByRole("link", { name: "Fisch", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");
  await page.getByRole("link", { name: "bis 20 Min." }).click();
  await expect(page.getByRole("status")).toHaveText("1 Rezept passt dazu");
  await expect(page.getByRole("link", { name: /Lachs mit Currysahne/ })).toBeVisible();

  await page.getByRole("link", { name: "Alle Filter zurücksetzen" }).click();
  await expect(page.getByRole("region", { name: "Stöbern" })).toBeVisible();

  // A tag narrows the library down like everything else, and two tags mean both.
  await page.goto("/rezepte?tag=herbst");
  await expect(page.getByRole("status")).toHaveText("2 Rezepte passen dazu");
  await page.getByRole("link", { name: "Reis & Getreide" }).click();
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
