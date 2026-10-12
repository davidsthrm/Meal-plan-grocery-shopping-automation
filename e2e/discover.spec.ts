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
  await expect(page.getByRole("region", { name: "Favoriten", exact: true })).toContainText(
    "Gemüse-Lasagne",
  );

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
  await expect(page.getByRole("region", { name: "Favoriten", exact: true })).toBeVisible();

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

test("a favourite is one tap and leads its shelves from then on", async ({ page }) => {
  await page.goto("/rezepte?q=Pfeffersteak");
  await page.getByRole("link", { name: /Pfeffersteak/ }).click();
  await page.getByRole("button", { name: "Als Favorit merken" }).click();
  await expect(page.getByRole("button", { name: "Favorit", exact: true })).toBeVisible();

  await page.goto("/rezepte");
  await expect(page.getByRole("region", { name: "Favoriten", exact: true })).toContainText(
    "Pfeffersteak",
  );

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
