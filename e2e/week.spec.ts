import { expect, test, type Page } from "@playwright/test";
import { resetHousehold, resetLibrary, signIn } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
});

const meal = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/**
 * Ticks or unticks a weekday chip the way a finger does, on its visible label. The box itself
 * is hidden for screen readers only; clicked by force at its spot, the click could land on
 * the bar at the bottom of a phone.
 */
async function setDay(page: Page, name: string, on: boolean) {
  const box = page.getByLabel(name);
  if ((await box.isChecked()) !== on) {
    await page.locator("label", { has: box }).click();
  }
  await expect(box).toBeChecked({ checked: on });
}

/** Today where the household lives, as the app sees it. */
function today(): { date: string; weekday: string; monday: string } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(
    day,
  );
  const monday = new Date(day.getTime() - ((day.getUTCDay() || 7) - 1) * 86_400_000);
  return { date, weekday, monday: monday.toISOString().slice(0, 10) };
}

async function plan(page: Page, name: string, recipe: string) {
  await page.getByRole("link", { name: `${name} planen` }).click();
  await page.getByPlaceholder("Titel oder Zutat").fill(recipe);
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("button", { name: `${recipe} einplanen` })
    .click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, name)).toContainText(recipe);
}

test("a saved plan is read, with what there is today on top and a pen for a change", async ({
  page,
}) => {
  const now = today();
  const lunch = `${now.weekday} Mittag`;
  await page.goto(`/woche?w=${now.monday}`);
  await plan(page, lunch, "Pilzrisotto");

  // What there is to eat today stands on top of the running week. The test user has a name,
  // so the greeting above says the day and the card does not repeat it.
  await expect(page.getByRole("region", { name: "Heute" })).toContainText("Pilzrisotto");
  await expect(page.getByText(new RegExp(`^${now.weekday}, \\d`)).first()).toBeVisible();

  // Done planning. The controls go, the meals stay.
  await page.getByRole("button", { name: "Plan speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  await expect(meal(page, lunch)).toContainText("Pilzrisotto");
  await expect(page.getByRole("link", { name: `${lunch} ändern` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `${lunch} leeren` })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Hast du einen Vorschlag/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plan vervollständigen" })).toHaveCount(0);

  // The pen opens one meal, and only that one.
  await page.getByRole("link", { name: `${lunch} bearbeiten` }).click();
  await expect(page.getByRole("button", { name: `${lunch} leeren` })).toBeVisible();
  await expect(page.getByRole("button", { name: `${now.weekday} Abend leeren` })).toHaveCount(0);
  await page.getByRole("link", { name: "Fertig" }).click();
  await expect(page.getByRole("button", { name: `${lunch} leeren` })).toHaveCount(0);

  // Taking the pen to the whole plan opens it for planning again.
  await page.getByRole("button", { name: "Plan bearbeiten" }).click();
  await expect(page.getByRole("button", { name: `${lunch} leeren` })).toBeVisible();
});

test("a recipe opened from the plan leads back to the plan", async ({ page }) => {
  await page.goto("/woche?w=2027-03-01");
  await plan(page, "Montag Mittag", "Pilzrisotto");
  await meal(page, "Montag Mittag").getByRole("link", { name: "Pilzrisotto" }).click();
  await expect(page.getByRole("heading", { name: "Pilzrisotto" })).toBeVisible();
  // Not the library: the week it was opened from.
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(page.getByRole("heading", { name: "1.–7. März" })).toBeVisible();
});

test("a week is rubbed out as a whole, after asking", async ({ page }) => {
  await page.goto("/woche?w=2027-03-01");
  await plan(page, "Montag Mittag", "Pilzrisotto");
  await plan(page, "Mittwoch Abend", "Tomatensalat");

  await page.getByRole("button", { name: "Ganze Woche leeren" }).click();
  // Asked first, and "no" leaves everything.
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(meal(page, "Montag Mittag")).toContainText("Pilzrisotto");

  await page.getByRole("button", { name: "Ganze Woche leeren" }).click();
  await page.getByRole("button", { name: "Ja, leeren" }).click();
  await expect(page.getByRole("link", { name: "Montag Mittag planen" })).toBeVisible();
  // The rubber is gone and the empty plan can be seen: it once stayed rubbed out.
  await expect(page.locator("#wochenblatt")).not.toHaveClass(/erasing/);
  await expect(page.getByRole("link", { name: "Montag Mittag planen" })).toHaveCSS("opacity", "1");
  await expect(page.locator("#wochenblatt > li").first()).toHaveCSS("opacity", "1");
  await expect(page.getByRole("link", { name: "Mittwoch Abend planen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ganze Woche leeren" })).toHaveCount(0);
});

test("a meal at grandma's or one that is ordered asks for no recipe", async ({ page }) => {
  await page.goto("/woche?w=2027-03-01");
  // One tap away, like eating out.
  await page.getByRole("link", { name: "Dienstag Mittag planen" }).click();
  await page.getByRole("button", { name: "Oma Heidrun" }).click();
  // The page for one meal stays and says what was planned; only then back to the week.
  await expect(page.getByText("Geplant: Oma Heidrun")).toBeVisible();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, "Dienstag Mittag")).toContainText("Oma Heidrun");
  await expect(meal(page, "Dienstag Mittag")).not.toContainText("Noch kein Rezept dazu");
  // Typed in, it is the same meal.
  await page.getByRole("link", { name: "Mittwoch Mittag planen" }).click();
  await page.getByLabel("Eigener Eintrag").fill("oma heidrun");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByText("Geplant: Oma Heidrun")).toBeVisible();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, "Mittwoch Mittag")).toContainText("Oma Heidrun");
  await expect(meal(page, "Mittwoch Mittag")).not.toContainText("Noch kein Rezept dazu");

  // Anything else that needs no recipe says so once.
  await page.getByRole("link", { name: "Donnerstag Abend planen" }).click();
  await page.getByLabel("Eigener Eintrag").fill("Pizza bestellen");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByText("Geplant: Pizza bestellen")).toBeVisible();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(meal(page, "Donnerstag Abend")).toContainText("Noch kein Rezept dazu");
  await page.getByRole("button", { name: "Donnerstag Abend: braucht kein Rezept" }).click();
  await expect(meal(page, "Donnerstag Abend")).toContainText("Pizza bestellen");
  await expect(meal(page, "Donnerstag Abend")).not.toContainText("Noch kein Rezept dazu");
});

test("the household sets its shopping days, and the notes follow", async ({ page }) => {
  await page.goto("/einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  // Thursday instead of Friday.
  await setDay(page, "Supermarkt am Freitag", false);
  await setDay(page, "Supermarkt am Donnerstag", true);
  await page
    .getByRole("region", { name: "Einkaufstage" })
    .getByRole("button", { name: "Speichern" })
    .click();
  await expect(page.getByRole("status")).toContainText("Gespeichert");

  await page.goto("/einkauf?w=2027-03-01");
  const notes = page.getByRole("list", { name: "Zettel" });
  await expect(
    notes.getByRole("link", { name: /^Supermarkt, Donnerstag, 4\. März/ }),
  ).toBeVisible();
  await expect(notes.getByRole("link", { name: /^Supermarkt, Freitag/ })).toHaveCount(0);

  // Without a day at the supermarket there is nowhere to buy the rest.
  await page.goto("/einstellungen");
  await setDay(page, "Supermarkt am Montag", false);
  await setDay(page, "Supermarkt am Donnerstag", false);
  await page
    .getByRole("region", { name: "Einkaufstage" })
    .getByRole("button", { name: "Speichern" })
    .click();
  await expect(page.getByRole("region", { name: "Einkaufstage" }).getByRole("alert")).toContainText(
    "mindestens einen Tag im Supermarkt",
  );
});

test("the meat of several meals is one visit to the butcher, on the household's day", async ({
  page,
}) => {
  // Without a butcher day of its own, the household goes there when it shops anyway.
  await page.goto("/woche?w=2027-03-01");
  // Dinners: a lunch on a working day is bought on the errand before its day.
  await plan(page, "Montag Abend", "Pfeffersteak");
  await plan(page, "Dienstag Abend", "Pfeffersteak");
  await page.goto("/einkauf?w=2027-03-01");
  const notes = page.getByRole("list", { name: "Zettel" });
  const butcher = notes.getByRole("link", { name: /^Metzger, / });
  await expect(butcher).toHaveCount(1);
  await expect(butcher).toHaveAccessibleName(/^Metzger, Montag, 1\. März/);
  await expect(butcher).toContainText("8x Rindersteaks");

  // Saturday morning at the butcher: the steaks for Monday and Tuesday are bought then.
  await page.goto("/einstellungen");
  await setDay(page, "Metzger am Samstag", true);
  await page
    .getByRole("region", { name: "Einkaufstage" })
    .getByRole("button", { name: "Speichern" })
    .click();
  await expect(page.getByRole("status")).toContainText("Gespeichert");
  await page.goto("/einkauf?w=2027-03-01");
  await expect(butcher).toHaveCount(1);
  await expect(butcher).toHaveAccessibleName(/^Metzger, Samstag, 27\. Februar/);
  await expect(butcher).toContainText("8x Rindersteaks");
});

test("what comes from the market is the household's to say", async ({ page }) => {
  await page.goto("/einstellungen");
  const fresh = page.getByRole("region", { name: "Frisch vom Markt und vom Metzger" });
  await expect(fresh).toContainText("Metzger: Fleisch & Wurst");
  await fresh.getByText("Ändern").click();
  // Eggs come from the market in this household.
  await fresh.getByLabel("Eier").selectOption("market");
  await fresh.getByRole("button", { name: "Speichern" }).click();
  await expect(fresh).toContainText("Markt: Obst & Gemüse, Fisch & Meeresfrüchte, Eier");
  // Back as it was, for the tests after this one.
  await fresh.getByLabel("Eier").selectOption("");
  await fresh.getByRole("button", { name: "Speichern" }).click();
  await expect(fresh).not.toContainText("Eier,");
});

test("a member invites someone, who joins the household with an account of their own", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/einstellungen");
  const family = page.getByRole("region", { name: "Familie" });
  await family.getByLabel("Dein Name").fill("Testkoch");
  await family.getByRole("button", { name: "Name speichern" }).click();
  await expect(family).toContainText("Testkoch");

  await family.getByRole("button", { name: "Einladung erstellen" }).click();
  const link = await family.getByLabel("Einladung zu Essensplan").inputValue();
  expect(link).toMatch(/\/einladung\/[\w-]{40,}$/);
  await expect(family).toContainText("Offene Einladung, gilt bis");

  // Someone without an account opens the link on their own phone.
  const context = await browser.newContext({ baseURL });
  const guest = await context.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByText("E2E-Test (automatisch)")).toBeVisible();
  // What is typed is checked before an account is made.
  await guest.getByLabel("Dein Name").fill("Gast");
  await guest.getByLabel("E-Mail").fill(`e2e-gast-${Date.now()}@example.org`);
  await guest.getByLabel("Passwort").fill("kurz");
  await guest
    .getByLabel("Passwort")
    .evaluate((field: HTMLInputElement) => field.removeAttribute("minlength"));
  await guest.getByRole("button", { name: "Beitreten" }).click();
  await expect(guest.getByText("Das Passwort braucht mindestens 8 Zeichen.")).toBeVisible();
  await guest.getByLabel("Passwort").fill("ein gutes passwort");
  await guest.getByRole("button", { name: "Beitreten" }).click();

  // In, and asked like every first visit what a week should contain and when it shops.
  await guest.waitForURL("**/woche/ziele?start=1");
  await expect(guest.getByRole("heading", { name: "Einkaufstage" })).toBeVisible();
  await guest.getByRole("button", { name: "So lassen" }).click();
  await guest.goto("/einstellungen");
  const theirs = guest.getByRole("region", { name: "Familie" });
  await expect(theirs).toContainText("Testkoch");
  await expect(theirs).toContainText("Gast");

  // The link worked once.
  const again = await (await browser.newContext({ baseURL })).newPage();
  await again.goto(new URL(link).pathname);
  await expect(again.getByText("Diese Einladung gilt nicht mehr")).toBeVisible();
  // And a made-up one never did.
  await again.goto("/einladung/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  await expect(again.getByText("Diese Einladung gilt nicht mehr")).toBeVisible();
  await again.context().close();
  await context.close();
});

test("the week is a small note for the pinboard", async ({ page }) => {
  await page.goto("/woche?w=2027-03-01");
  // Nothing planned: nothing to pin up.
  await expect(page.getByRole("link", { name: "Für die Pinnwand" })).toHaveCount(0);
  await plan(page, "Montag Mittag", "Pfeffersteak");
  const link = page.getByRole("link", { name: "Für die Pinnwand" });
  await expect(link).toHaveAttribute("href", "/woche/pdf?w=2027-03-01");
  const pdf = await page.request.get("/woche/pdf?w=2027-03-01");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
