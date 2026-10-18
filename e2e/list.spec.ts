import { expect, test, type Page } from "@playwright/test";
import { resetHousehold, resetLibrary, signIn } from "./fixtures";

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-03-01";

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
});

/** Plans a recipe for a meal by searching for it. */
async function plan(page: Page, meal: string, recipe: string) {
  await page.getByRole("link", { name: `${meal} planen` }).click();
  await page.getByPlaceholder("Titel oder Zutat").fill(recipe);
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("button", { name: `${recipe} einplanen` })
    .click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(page.getByRole("region", { name: meal, exact: true })).toContainText(recipe);
}

/** A note among the others, the note picked up, and one kind of grocery on it. */
const tile = (page: Page, note: string) =>
  page.getByRole("list", { name: "Zettel" }).getByRole("link", { name: new RegExp(`^${note}`) });
const sheet = (page: Page, note: string) => page.getByRole("region", { name: note, exact: true });
const group = (page: Page, note: string, name: string) =>
  sheet(page, note).getByRole("region", { name, exact: true });
const all = (page: Page) => page.getByRole("link", { name: "← Alle Zettel" });

const MARKET = "Markt, Samstag, 27. Februar";
const BUTCHER = "Metzger, Montag, 1. März";
const MONDAY = "Supermarkt, Montag, 1. März";
const FRIDAY = "Supermarkt, Freitag, 5. März";
const BAKERY = "Bäcker, Montag, 1. März";
const MARKET_ON_FRIDAY = "Markt, Freitag, 26. Februar";
const DRUGSTORE = "dm, Samstag, 6. März";

test("the week becomes a note for every errand, to pick up and work through", async ({ page }) => {
  // A long walk: planning, seven notes, ticking, moving, and the plan changed again.
  test.setTimeout(150_000);
  await page.goto(`/woche?w=${WEEK}`);
  // The steak for a dinner: a lunch on a working day is bought on the errand before its day.
  await plan(page, "Dienstag Abend", "Pfeffersteak");
  await plan(page, "Dienstag Mittag", "Kartoffelsuppe");
  // A cold supper with bread from the bakery and a cucumber.
  await page.getByRole("link", { name: "Montag Abend planen" }).click();
  await page.getByRole("button", { name: "Vesper" }).click();
  await page.getByRole("link", { name: "Montag Abend: Lebensmittel" }).click();
  await page.getByRole("button", { name: "Brot hinzufügen" }).click();
  await page.getByRole("button", { name: "Gurke hinzufügen" }).click();
  await expect(page.getByRole("region", { name: "Ausgewählt" })).toContainText("Gurke");
  // Two cakes for an invitation, outside the meals.
  await page.goto(`/woche/auswahl?w=${WEEK}&ziel=extra&q=mohn`);
  await page.getByRole("button", { name: "Zitronen-Mohn-Kuchen einplanen" }).click();
  await page.getByRole("button", { name: "Mehr von Zitronen-Mohn-Kuchen" }).click();
  await expect(page.getByRole("region", { name: "Außerdem" })).toContainText("2 Springform");

  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(page.getByRole("heading", { name: "1.–7. März" })).toBeVisible();
  // Every errand is a note: the market before the week, because it buys for Monday and
  // Tuesday, the supermarket twice, the market again, and the butcher and the bakery on the
  // day of the meal that needs something from them. Neither has a day of its own. And dm on
  // Saturday, which the plan never fills.
  await expect(page.getByRole("list", { name: "Zettel" }).getByRole("link")).toHaveCount(7);
  await expect(tile(page, DRUGSTORE)).toContainText("Noch nichts notiert");
  // What is fresh comes from the market, the meat from the butcher on its day before.
  // A note shows its first lines while it lies among the others.
  await expect(tile(page, MARKET)).toContainText("2x Karotten");
  await expect(tile(page, MARKET)).toContainText("1x Gurke");
  await expect(tile(page, BUTCHER)).toContainText("4x Rindersteaks");
  await expect(tile(page, BUTCHER)).not.toContainText("Erledigt");
  await expect(tile(page, FRIDAY)).toContainText("Nichts zu kaufen");
  // The supper's bread has a note of its own, for the bakery on that day.
  await tile(page, BAKERY).click();
  await expect(sheet(page, BAKERY)).toContainText("Brot");
  await expect(sheet(page, BAKERY)).not.toContainText("· Bäcker");
  await all(page).click();

  // The market can be done on another day. The note says which days would work and why
  // another would not: the cucumber is for Monday.
  await tile(page, MARKET).click();
  await page.getByText("An einem anderen Tag einkaufen").click();
  await expect(sheet(page, MARKET)).toContainText(
    "Di 2. geht nicht: Gurke wird schon am Montag gebraucht.",
  );
  await page.getByRole("button", { name: "Einkauf verlegen auf Freitag, 26. Februar" }).click();
  await expect(sheet(page, MARKET_ON_FRIDAY)).toContainText("2x Karotten");
  // Done there: one tap ticks everything, and the note says so.
  await page.getByRole("button", { name: "Einkauf erledigt" }).click();
  await expect(sheet(page, MARKET_ON_FRIDAY).getByRole("status")).toContainText("Erledigt");
  await all(page).click();
  await expect(tile(page, MARKET)).toHaveCount(0);
  await expect(tile(page, MARKET_ON_FRIDAY)).toContainText("Erledigt");

  // Salt is assumed to be at home. What is at home is one list for the whole week.
  await page.getByText("Haben wir schon").click();
  await page.getByRole("button", { name: "Salz doch kaufen" }).click();
  await expect(tile(page, MONDAY)).toContainText("Salz");

  // A note is picked up to work through it.
  await tile(page, MONDAY).click();
  await expect(sheet(page, MONDAY)).toContainText("für Dienstag");
  await expect(group(page, MONDAY, "Obst & Gemüse")).toHaveCount(0);
  // 200 ml and 100 ml of cream: the amount stands in front, the packs are one tap away.
  await expect(sheet(page, MONDAY).getByText("300 ml Sahne")).toBeVisible();
  await expect(group(page, MONDAY, "Gewürze, Öl & Essig")).toContainText("Salz");
  // Two cakes need 8 eggs, bought as a box of ten, on the week's first supermarket day.
  // Where a line comes from is one tap away.
  await page.getByText("10x Eier").click();
  await expect(page.getByText("Genau: 8 Stück")).toBeVisible();
  await expect(
    page.locator("li:visible", { hasText: /^Außerdem: Zitronen-Mohn-Kuchen$/ }),
  ).toHaveCount(1);

  // Lines written by hand onto the note: one the catalog knows, with its note, and one it
  // does not.
  const write = page.getByLabel("Auf den Zettel schreiben");
  await write.fill("Milch WS 1.29");
  await write.press("Enter");
  await expect(sheet(page, MONDAY).getByText("Milch WS 1.29", { exact: true })).toBeVisible();
  await write.fill("Geschenkpapier");
  await write.press("Enter");
  await expect(sheet(page, MONDAY).getByText("Geschenkpapier", { exact: true })).toBeVisible();

  // The wrapping paper is bought on Friday after all: the line moves to that note.
  await sheet(page, MONDAY).getByText("Geschenkpapier", { exact: true }).click();
  await page.getByRole("button", { name: "Geschenkpapier verschieben: Fr 5. Supermarkt" }).click();
  await expect(sheet(page, MONDAY).getByText("Geschenkpapier", { exact: true })).toHaveCount(0);
  await all(page).click();
  await expect(tile(page, FRIDAY)).toContainText("Geschenkpapier");
  await tile(page, FRIDAY).click();
  await sheet(page, FRIDAY).getByText("Geschenkpapier", { exact: true }).click();
  await expect(sheet(page, FRIDAY)).toContainText("verschoben von Mo 1. Supermarkt");
  await all(page).click();
  // The cream is for Tuesday: Friday is too late for it and is not offered, an errand
  // before Tuesday is.
  await tile(page, MONDAY).click();
  await sheet(page, MONDAY).getByText("300 ml Sahne").click();
  const moves = sheet(page, MONDAY).getByRole("group", { name: "Sahne verschieben" });
  await expect(moves.getByRole("button", { name: /Fr 5\. Supermarkt/ })).toHaveCount(0);
  await expect(moves.getByRole("button", { name: /Mo 1\. Metzger/ })).toBeVisible();
  await all(page).click();

  // Ticking off, and the tick survives a change of the plan.
  await tile(page, BUTCHER).click();
  // The last tick on a note finishes its errand, just like the button.
  await page.getByRole("button", { name: "4x Rindersteaks: erledigt" }).click();
  await expect(sheet(page, BUTCHER)).toContainText("1 erledigt");
  await expect(sheet(page, BUTCHER).getByRole("status")).toContainText("Erledigt");
  await page.goto(`/woche?w=${WEEK}`);
  await page.getByRole("button", { name: "Dienstag Mittag leeren" }).click();
  // The meal is open again. The soup may still show there as a pale idea, so that is what
  // is looked for, not the absence of its name.
  await expect(page.getByRole("link", { name: "Dienstag Mittag planen" })).toBeVisible();
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(tile(page, MARKET_ON_FRIDAY)).not.toContainText("2x Karotten");
  await expect(tile(page, MARKET_ON_FRIDAY)).toContainText("Erledigt");
  await expect(tile(page, BUTCHER)).toContainText("0 offen, 1 erledigt");

  // Every note is a file of its own, and all of them are one.
  const files = page.getByRole("navigation", { name: "Als PDF" });
  await expect(files.getByRole("link", { name: "Fr 5. Supermarkt" })).toBeVisible();
  for (const address of [
    `/einkauf/pdf?w=${WEEK}`,
    `/einkauf/pdf?w=${WEEK}&zettel=${WEEK}.bakery`,
  ]) {
    const pdf = await page.request.get(address);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  }
});

test("a meal planned after the shopping leaves the errand done", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Montag Abend", "Kartoffelsuppe");
  await page.goto(`/einkauf?w=${WEEK}`);
  await tile(page, MONDAY).click();
  await expect(sheet(page, MONDAY)).toContainText("Sahne");
  await page.getByRole("button", { name: "Einkauf erledigt" }).click();
  await expect(sheet(page, MONDAY).getByRole("status")).toContainText("Erledigt");
  // Back home, the soup is planned for Wednesday too. Monday's errand has not bought its
  // cream, and Monday stays done. The week lies ahead, so the Friday before it is still to
  // come and buys it.
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Mittwoch Abend", "Kartoffelsuppe");
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(tile(page, MONDAY)).toContainText("Erledigt");
  await expect(tile(page, MONDAY)).toContainText("0 offen, 1 erledigt");
  await expect(tile(page, "Supermarkt, Freitag, 26. Februar")).toContainText("Sahne");
});

test("the drugstore's note is written by hand: what, how many, for whom", async ({ page }) => {
  await page.goto(`/einkauf?w=${WEEK}`);
  await tile(page, DRUGSTORE).click();
  const dm = sheet(page, DRUGSTORE);
  await expect(dm).toContainText("Noch nichts notiert.");

  await page.getByLabel("Was").fill("Duschgel");
  await page.getByLabel("Menge").fill("2");
  await page.getByLabel("Für wen").fill("Lena");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(group(page, DRUGSTORE, "Körperpflege")).toContainText("2x Duschgel für Lena");

  await page.getByLabel("Was").fill("Klopapier");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(group(page, DRUGSTORE, "Haushalt")).toContainText("Klopapier");

  // Ticked like any line; moving it to a food note is not offered.
  await page.getByRole("button", { name: "2x Duschgel für Lena: erledigt" }).click();
  await expect(dm).toContainText("1 offen, 1 erledigt");
  await dm.getByText("Klopapier", { exact: true }).click();
  await expect(dm.getByText("Lieber woanders kaufen:")).toHaveCount(0);
  await dm.getByRole("button", { name: "Klopapier entfernen" }).click();
  await expect(dm).not.toContainText("Klopapier");
});

/** A day as the app writes it, `days` from today in the household's time zone. */
function fromToday(days: (weekday: number) => number): { date: string; monday: string } {
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const today = new Date(`${now}T00:00:00Z`);
  const day = new Date(today.getTime() + days(today.getUTCDay()) * 86_400_000);
  const monday = new Date(day.getTime() - ((day.getUTCDay() || 7) - 1) * 86_400_000);
  return { date: day.toISOString().slice(0, 10), monday: monday.toISOString().slice(0, 10) };
}

test("what was not bought at the drugstore comes along to its next note", async ({ page }) => {
  // dm is on Saturdays: the last one is over, the next one is today or later.
  const last = fromToday((weekday) => -((weekday - 6 + 7) % 7 || 7));
  const next = fromToday((weekday) => (6 - weekday + 7) % 7);
  await page.goto(`/einkauf?w=${last.monday}&zettel=${last.date}.drugstore`);
  await page.getByLabel("Was").fill("Deo");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  // The field is emptied once the line is stored; typed into earlier, the next is lost.
  await expect(page.getByRole("button", { name: "Deo: erledigt" })).toBeVisible();
  await page.getByLabel("Was").fill("Shampoo");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await page.getByRole("button", { name: "Shampoo: erledigt" }).click();
  await expect(page.getByRole("region", { name: /^dm, / })).toContainText("1 offen, 1 erledigt");

  // Not bought that day, the deodorant is on the next dm note; the shampoo was bought.
  await page.goto(`/einkauf?w=${next.monday}&zettel=${next.date}.drugstore`);
  const dm = page.getByRole("region", { name: /^dm, / });
  await expect(dm).toContainText("Deo");
  await expect(dm).not.toContainText("Shampoo");
  await page.getByRole("button", { name: "Deo: erledigt" }).click();
  await expect(dm).toContainText("0 offen, 1 erledigt");
});

test("a week with nothing planned has empty notes that say where they come from", async ({
  page,
}) => {
  await page.goto(`/einkauf?w=${WEEK}`);
  await expect(
    page.getByText("Für diese Woche steht noch nichts auf den Einkaufszetteln."),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Als PDF" })).toHaveCount(0);
});

test("what ran out at home is noted on a note pulled down over any page", async ({ page }) => {
  await page.goto("/rezepte");
  const note = page.getByRole("dialog", { name: "Merkzettel" });
  await expect(note).toBeHidden();
  await page.getByRole("link", { name: /^Merkzettel/ }).click();
  // The page stays where it is: the note lies on top of it.
  await expect(note).toBeVisible();
  await expect(page).toHaveURL(/\/rezepte$/);
  await expect(note.getByText("Es steht nichts darauf.")).toBeVisible();

  const write = note.getByLabel("Auf den Merkzettel schreiben");
  for (const text of ["Mehl", "Spülmittel"]) {
    await write.fill(text);
    await write.press("Enter");
    await expect(
      note.getByRole("button", { name: `${text} auf den Einkaufszettel` }),
    ).toBeVisible();
  }
  // Written a second time, it is still one entry.
  await write.fill("mehl");
  await write.press("Enter");
  await expect(page.getByRole("link", { name: "Merkzettel, 2 Einträge" })).toBeAttached();

  // One entry goes to the note of the next errand and leaves this one.
  await note.getByRole("button", { name: "Mehl auf den Einkaufszettel" }).click();
  const moved = note.getByRole("status");
  await expect(moved).toContainText("Steht auf dem Einkaufszettel:");
  await expect(note.getByRole("button", { name: "Mehl auf den Einkaufszettel" })).toHaveCount(0);
  // Its link leads to that note, and the yellow one goes back up.
  await moved.getByRole("link").click();
  await expect(page.getByRole("region", { name: /^Supermarkt, / })).toContainText("Mehl");
  await expect(note).toBeHidden();

  // What is left lies among the shopping notes, and a tap pulls the note down again.
  await page.getByRole("link", { name: "← Alle Zettel" }).click();
  await page
    .getByRole("list", { name: "Zettel" })
    .getByRole("link", { name: /Merkzettel/ })
    .click();
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Spülmittel streichen" }).click();
  await expect(note.getByText("Es steht nichts darauf.")).toBeVisible();
  await note.getByRole("button", { name: "Zurückstecken" }).click();
  await expect(note).toBeHidden();
});

test("what one device changes shows on another without reloading", async ({
  page,
  browser,
  baseURL,
}) => {
  // A second device of the same household, signed in by itself.
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await signIn(other);
  await other.goto("/einkauf");
  await expect(other.getByRole("link", { name: "Merkzettel, 0 Einträge" })).toBeVisible();
  // Give the second device the moment it needs to start listening.
  await other.waitForTimeout(2000);

  await page.goto("/woche");
  await page.getByRole("link", { name: /^Merkzettel/ }).click();
  const write = page.getByLabel("Auf den Merkzettel schreiben");
  await write.fill("Hefe");
  await write.press("Enter");
  await expect(page.getByRole("button", { name: "Hefe streichen" })).toBeVisible();

  // The other device shows it without anyone touching it: in the header, and as a note
  // among its shopping notes.
  await expect(other.getByRole("link", { name: "Merkzettel, 1 Eintrag" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(other.getByRole("list", { name: "Zettel" })).toContainText("Hefe");
  await context.close();
});

test("a note written next to a line stays with it", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Dienstag Abend", "Pfeffersteak");
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await sheet(page, MONDAY).getByText("200 ml Sahne").click();
  await page.getByLabel("Notiz zu Sahne").fill("Angebot 1,29");
  await page.getByRole("button", { name: "Merken" }).click();
  // The note's own field was called like the field naming the note, and the page broke.
  await expect(sheet(page, MONDAY)).toContainText("Angebot 1,29");
});

test("a typed line goes under its kind of grocery", async ({ page }) => {
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  const write = page.getByLabel("Auf den Zettel schreiben");
  // Named after what describes it, the grapes are still fruit.
  await write.fill("grüne Trauben");
  await write.press("Enter");
  await expect(group(page, MONDAY, "Obst & Gemüse")).toContainText("Weintrauben");

  // What the catalog does not know is put under a kind by hand, and stays there.
  await write.fill("Lakritzschnecken");
  await write.press("Enter");
  await expect(group(page, MONDAY, "Sonstiges")).toContainText("Lakritzschnecken");
  await sheet(page, MONDAY).getByText("Lakritzschnecken", { exact: true }).click();
  await sheet(page, MONDAY).getByLabel("Gehört zu").selectOption({ label: "Süßes & Snacks" });
  await sheet(page, MONDAY).getByRole("button", { name: "Einordnen" }).click();
  await expect(group(page, MONDAY, "Süßes & Snacks")).toContainText("Lakritzschnecken");

  await page.goto(`/einkauf?w=${WEEK}&zettel=2027-03-05.supermarket`);
  await write.fill("Lakritzschnecken");
  await write.press("Enter");
  await expect(group(page, FRIDAY, "Süßes & Snacks")).toContainText("Lakritzschnecken");
});
